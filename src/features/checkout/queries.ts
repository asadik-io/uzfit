import "server-only";
import { QueryError } from "@/features/discovery/queries";
import type { LocalizedText } from "@/lib/localized";
import { createClient } from "@/lib/supabase/server";

/** A published plan version with its eligible (public) venues, for order review. */
export async function getCheckoutPlan(planVersionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_versions")
    .select(
      `id, name, description, price_minor, currency, duration_days, visit_allowance, daily_visit_limit,
       max_future_bookings, booking_window_days, free_cancellation_minutes, is_demo,
       plan:plans!inner(code, is_active),
       plan_version_venues(venue:venues(slug, name))`,
    )
    .eq("id", planVersionId)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    throw new QueryError(error.code);
  }
  if (!data || !data.plan.is_active) {
    return null;
  }
  return {
    ...data,
    venues: data.plan_version_venues
      .map((pvv) => pvv.venue)
      .filter((venue): venue is { slug: string; name: LocalizedText } => venue !== null),
  };
}

/** The member's own order (RLS restricts rows to the owner). */
export async function getMyOrder(orderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, status, amount_minor, currency, provider, is_demo, needs_reconciliation, created_at, expires_at,
       paid_at, failed_at, cancelled_at, refunded_at, plan_version_id,
       plan_version:plan_versions(name, duration_days)`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    throw new QueryError(error.code);
  }
  return data;
}

export type MyOrder = NonNullable<Awaited<ReturnType<typeof getMyOrder>>>;

export async function getMembershipForOrder(orderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, starts_at, ends_at, status, is_demo")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    throw new QueryError(error.code);
  }
  return data;
}
