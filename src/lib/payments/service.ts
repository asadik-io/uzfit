import "server-only";
import { logEvent } from "@/lib/request";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { adapterFor } from "./index";
import type { NormalizedPaymentEvent, PaymentProviderId } from "./types";

type ApplyResult = Database["public"]["Functions"]["apply_payment_event"]["Returns"][number];

export class PaymentProcessingError extends Error {
  constructor(readonly code: string | undefined) {
    super(`Payment event could not be applied${code ? ` (${code})` : ""}`);
    this.name = "PaymentProcessingError";
  }
}

/**
 * Records one authenticated, normalized event. apply_payment_event deduplicates it, validates
 * the transaction, amount, and currency against the order snapshot, moves the payment state
 * forward only, and activates at most one membership under the member lock.
 */
export async function applyPaymentEvent(
  provider: PaymentProviderId,
  event: NormalizedPaymentEvent,
): Promise<ApplyResult> {
  const { data, error } = await createAdminClient()
    .rpc("apply_payment_event", {
      p_provider: provider,
      p_dedup_key: event.dedupKey,
      p_event_type: event.eventType,
      p_order_id: event.orderId,
      p_provider_transaction_id: event.providerTransactionId,
      p_amount_minor: event.amountMinor,
      p_currency: event.currency,
      p_status: event.status,
      p_metadata: event.metadata,
    })
    .single();
  if (error || !data) {
    logEvent("error", "payment.apply_failed", { provider, code: error?.code, orderId: event.orderId });
    throw new PaymentProcessingError(error?.code);
  }
  logEvent(data.outcome === "rejected" ? "warn" : "info", "payment.event", {
    provider,
    outcome: data.outcome,
    code: data.outcome_code,
    orderId: event.orderId,
    orderStatus: data.order_status,
  });
  return data;
}

/**
 * Entry point for provider callbacks (webhook route) and the simulated demo provider. Nothing
 * is recorded unless the adapter authenticated the request.
 */
export async function processPaymentCallback(
  provider: PaymentProviderId,
  input: { rawBody: string; headers: Headers },
): Promise<{ httpStatus: number; results: ApplyResult[]; reason?: string }> {
  const verification = await adapterFor(provider).verifyCallback(input);
  if (!verification.ok) {
    logEvent("warn", "payment.callback_rejected", { provider, reason: verification.reason });
    return { httpStatus: verification.httpStatus, results: [], reason: verification.reason };
  }
  const results: ApplyResult[] = [];
  for (const event of verification.events) {
    results.push(await applyPaymentEvent(provider, event));
  }
  return { httpStatus: 200, results };
}

/**
 * Reconciliation job step: asks each provider for the status of older pending orders (catching
 * missed callbacks), then cancels checkouts that were abandoned. Bounded and idempotent.
 */
export async function reconcilePayments(limit = 50): Promise<{ checked: number; applied: number; expired: number }> {
  const admin = createAdminClient();
  const { data: orders, error } = await admin.rpc("list_orders_for_reconciliation", { p_limit: limit });
  if (error) {
    throw new PaymentProcessingError(error.code);
  }
  let checked = 0;
  let applied = 0;
  for (const order of orders ?? []) {
    checked += 1;
    try {
      const event = await adapterFor(order.provider).queryStatus({
        orderId: order.order_id,
        amountMinor: order.amount_minor,
        currency: order.currency,
      });
      if (event) {
        await applyPaymentEvent(order.provider, event);
        applied += 1;
      }
    } catch (cause) {
      logEvent("error", "payment.reconcile_failed", {
        provider: order.provider,
        orderId: order.order_id,
        error: cause instanceof Error ? cause.name : "unknown",
      });
    }
  }
  const { data: expired, error: expireError } = await admin.rpc("expire_stale_orders", { p_limit: 200 });
  if (expireError) {
    throw new PaymentProcessingError(expireError.code);
  }
  return { checked, applied, expired: expired ?? 0 };
}
