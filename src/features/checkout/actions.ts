"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { demoPaymentsAllowed } from "@/lib/env";
import { type ActionResult, fail, toDomainError } from "@/lib/errors";
import { isLocale, type Locale } from "@/lib/i18n/routing";
import { checkoutAdapter } from "@/lib/payments";
import { signDemoEvent } from "@/lib/payments/demo";
import { processPaymentCallback } from "@/lib/payments/service";
import { logEvent, requestId } from "@/lib/request";
import { hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const localeField = z.string().refine(isLocale);
const startSchema = z.object({ planVersionId: z.guid(), locale: localeField });

/**
 * Creates an immutable pending order in the database (price, currency, and plan version are
 * snapshotted there, never taken from the form) and sends the member to the provider checkout.
 */
export async function startCheckoutAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = startSchema.safeParse({
    planVersionId: formData.get("planVersionId"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const adapter = checkoutAdapter();
  if (!adapter || !hasAdminClient()) {
    return fail("PAYMENT_UNAVAILABLE");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_order", { p_plan_version_id: parsed.data.planVersionId, p_provider: adapter.id })
    .single();
  if (error || !data) {
    const code = toDomainError(error);
    if (code === "UNEXPECTED_ERROR") {
      logEvent("error", "checkout.create_order_failed", { requestId: await requestId(), code: error?.code });
    }
    return fail(code);
  }
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await adapter.createCheckout({
      orderId: data.order_id,
      amountMinor: data.amount_minor,
      currency: data.currency,
      locale: parsed.data.locale as Locale,
    }));
  } catch (cause) {
    logEvent("error", "checkout.provider_failed", {
      requestId: await requestId(),
      provider: adapter.id,
      error: cause instanceof Error ? cause.name : "unknown",
    });
    return fail("PAYMENT_UNAVAILABLE");
  }
  redirect(redirectUrl);
}

const demoSchema = z.object({
  orderId: z.guid(),
  outcome: z.enum(["succeeded", "failed"]),
  locale: localeField,
});

/**
 * The simulated provider's "pay" and "decline" buttons. The result is delivered as a signed demo
 * event through the same verification and processing path as a real provider callback; the
 * member never activates a membership directly. Refused in production.
 */
export async function simulateDemoPaymentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = demoSchema.safeParse({
    orderId: formData.get("orderId"),
    outcome: formData.get("outcome"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  if (!demoPaymentsAllowed() || !hasAdminClient()) {
    return fail("PAYMENT_UNAVAILABLE");
  }
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, provider, amount_minor, currency")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (error) {
    return fail(toDomainError(error));
  }
  if (!order || order.provider !== "demo") {
    return fail("ORDER_NOT_FOUND");
  }
  const returnPath = `/${parsed.data.locale}/checkout/return/${order.id}`;
  if (order.status !== "pending") {
    redirect(returnPath);
  }
  const event = signDemoEvent({
    orderId: order.id,
    amountMinor: order.amount_minor,
    currency: order.currency,
    status: parsed.data.outcome,
  });
  try {
    const result = await processPaymentCallback("demo", event);
    if (result.httpStatus !== 200) {
      return fail("PAYMENT_UNAVAILABLE");
    }
  } catch {
    return fail("UNEXPECTED_ERROR");
  }
  redirect(returnPath);
}
