import { NextResponse, type NextRequest } from "next/server";
import { isPaymentProviderId } from "@/lib/payments";
import { processPaymentCallback } from "@/lib/payments/service";
import { logEvent } from "@/lib/request";

const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Provider payment notifications. Authentication is the adapter's job (provider signature or
 * credentials); cookies are ignored. Processing is idempotent, so provider retries are safe, and
 * a 5xx response asks the provider to retry later.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/payments/[provider]/webhook">) {
  const { provider } = await context.params;
  if (!isPaymentProviderId(provider)) {
    return json({ error: "not_found" }, 404);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large" }, 413);
  }
  try {
    const result = await processPaymentCallback(provider, { rawBody, headers: request.headers });
    if (result.httpStatus !== 200) {
      return json({ error: result.reason ?? "rejected" }, result.httpStatus);
    }
    return json({ ok: true, results: result.results.map((r) => ({ outcome: r.outcome, code: r.outcome_code })) }, 200);
  } catch (cause) {
    logEvent("error", "payment.webhook_failed", {
      provider,
      error: cause instanceof Error ? cause.name : "unknown",
    });
    return json({ error: "processing_failed" }, 500);
  }
}
