import "server-only";
import { QueryError } from "@/features/discovery/queries";
import { createClient } from "@/lib/supabase/server";

const HISTORY_LIMIT = 20;

/** The member's memberships, newest first (RLS limits rows to the owner). */
export async function getMembershipHistory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, starts_at, ends_at, status, source, is_demo, revoked_at, plan_version:plan_versions(name, version)")
    .order("starts_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}

/** Checkout orders with their payment state, newest first. */
export async function getPaymentHistory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, amount_minor, currency, provider, is_demo, needs_reconciliation, expires_at, plan_version:plan_versions(name)",
    )
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    throw new QueryError(error.code);
  }
  return data ?? [];
}
