import "server-only";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { demoPaymentsAllowed, serverEnv } from "@/lib/env";
import type {
  CallbackVerification,
  CheckoutOrder,
  NormalizedPaymentEvent,
  PaymentAdapter,
  PaymentStatus,
} from "./types";

/**
 * Demo payment adapter for development and previews. It simulates a provider: the checkout
 * "provider page" is an internal, clearly labeled page; its result is delivered as an
 * HMAC-signed event through the same verification and processing path a real provider callback
 * uses. No money is collected, memberships are marked as demo, and the adapter is refused in
 * production both here and in the database (private.settings.demo_payments_enabled).
 *
 * The signature scheme is UzFit's own and applies only to this adapter; it does not describe
 * any real provider's API.
 */

export const DEMO_SIGNATURE_HEADER = "x-uzfit-demo-signature";
export const DEMO_TIMESTAMP_HEADER = "x-uzfit-demo-timestamp";
const TOLERANCE_SECONDS = 300;

// Outside production a missing secret falls back to a per-process key, which is enough for the
// in-app demo flow (signed and verified by the same server). Set PAYMENT_WEBHOOK_SECRET to send
// demo events from external tools.
let fallbackSecret: string | null = null;

function demoSecret(): string {
  const configured = serverEnv().PAYMENT_WEBHOOK_SECRET;
  if (configured) {
    return configured;
  }
  fallbackSecret ??= randomBytes(32).toString("base64url");
  return fallbackSecret;
}

function sign(timestamp: string, rawBody: string): string {
  return `v1=${createHmac("sha256", demoSecret()).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

const eventSchema = z.object({
  event_id: z.uuid(),
  order_id: z.guid(),
  transaction_id: z.string().regex(/^demo_[A-Za-z0-9-]{8,64}$/),
  amount_minor: z.number().int().nonnegative().max(1_000_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["pending", "succeeded", "failed", "refunded"]),
});

export type DemoEvent = z.infer<typeof eventSchema>;

/** Builds a signed demo event, as the simulated provider would send it. */
export function signDemoEvent(event: {
  orderId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  transactionId?: string;
}): { rawBody: string; headers: Headers } {
  const body: DemoEvent = {
    event_id: randomUUID(),
    order_id: event.orderId,
    transaction_id: event.transactionId ?? `demo_${randomUUID()}`,
    amount_minor: event.amountMinor,
    currency: event.currency,
    status: event.status,
  };
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers({
    "content-type": "application/json",
    [DEMO_TIMESTAMP_HEADER]: timestamp,
    [DEMO_SIGNATURE_HEADER]: sign(timestamp, rawBody),
  });
  return { rawBody, headers };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const demoAdapter: PaymentAdapter = {
  id: "demo",
  isDemo: true,
  refunds: "manual",

  isAvailable() {
    return demoPaymentsAllowed();
  },

  async createCheckout(order: CheckoutOrder) {
    return { redirectUrl: `/${order.locale}/checkout/demo/${order.orderId}` };
  },

  async verifyCallback({ rawBody, headers }): Promise<CallbackVerification> {
    if (!demoPaymentsAllowed()) {
      return { ok: false, httpStatus: 403, reason: "demo_disabled" };
    }
    const timestamp = headers.get(DEMO_TIMESTAMP_HEADER) ?? "";
    const signature = headers.get(DEMO_SIGNATURE_HEADER) ?? "";
    if (!/^\d{9,11}$/.test(timestamp) || !signature) {
      return { ok: false, httpStatus: 401, reason: "missing_signature" };
    }
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
      return { ok: false, httpStatus: 401, reason: "stale_timestamp" };
    }
    if (!safeEqual(signature, sign(timestamp, rawBody))) {
      return { ok: false, httpStatus: 401, reason: "bad_signature" };
    }
    let parsed: DemoEvent;
    try {
      parsed = eventSchema.parse(JSON.parse(rawBody));
    } catch {
      return { ok: false, httpStatus: 400, reason: "malformed_event" };
    }
    const event: NormalizedPaymentEvent = {
      dedupKey: `event:${parsed.event_id}`,
      eventType: `demo.payment.${parsed.status}`,
      orderId: parsed.order_id,
      providerTransactionId: parsed.transaction_id,
      amountMinor: parsed.amount_minor,
      currency: parsed.currency,
      status: parsed.status,
      metadata: { demo: true },
    };
    return { ok: true, events: [event] };
  },

  async queryStatus() {
    // The simulated provider keeps no remote state; unfinished demo orders simply expire.
    return null;
  },
};
