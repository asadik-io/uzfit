import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { reconcilePayments } from "@/lib/payments/service";
import { logEvent } from "@/lib/request";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const NO_SHOW_BATCH = 500;
const MAX_NO_SHOW_BATCHES = 10;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Protected, idempotent maintenance entry point (Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET`). Every step processes a bounded batch and tolerates missed runs; booking and
 * entitlement rules never depend on this job having run.
 */
async function handle(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || !hasAdminClient()) {
    logEvent("error", "jobs.not_configured");
    return json({ error: "not_configured" }, 503);
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const started = Date.now();
  const admin = createAdminClient();
  const summary: Record<string, unknown> = {};
  const failures: string[] = [];

  try {
    let total = 0;
    for (let batch = 0; batch < MAX_NO_SHOW_BATCHES; batch += 1) {
      const { data, error } = await admin.rpc("reconcile_no_shows", { p_limit: NO_SHOW_BATCH });
      if (error) {
        throw new Error(error.code ?? "rpc_failed");
      }
      total += data ?? 0;
      if ((data ?? 0) < NO_SHOW_BATCH) {
        break;
      }
    }
    summary.noShows = total;
  } catch (error) {
    failures.push("no_shows");
    logEvent("error", "jobs.no_shows_failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  try {
    summary.payments = await reconcilePayments(50);
  } catch (error) {
    failures.push("payments");
    logEvent("error", "jobs.payments_failed", { error: error instanceof Error ? error.name : "unknown" });
  }

  try {
    const { data, error } = await admin.rpc("cleanup_ephemeral_data");
    if (error) {
      throw new Error(error.code ?? "rpc_failed");
    }
    summary.cleanup = data;
  } catch (error) {
    failures.push("cleanup");
    logEvent("error", "jobs.cleanup_failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  try {
    const { data, error } = await admin.rpc("session_occupancy_drift");
    if (error) {
      throw new Error(error.code ?? "rpc_failed");
    }
    summary.occupancyDrift = data?.length ?? 0;
    if (data && data.length > 0) {
      logEvent("error", "jobs.occupancy_drift", { sessions: data.slice(0, 20).map((row) => row.session_id) });
    }
  } catch (error) {
    failures.push("drift_check");
    logEvent("error", "jobs.drift_check_failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  summary.durationMs = Date.now() - started;
  logEvent(failures.length ? "error" : "info", "jobs.reconcile", { ...summary, failures });
  return json({ ok: failures.length === 0, ...summary, failures }, failures.length ? 500 : 200);
}

export const GET = handle;
export const POST = handle;
