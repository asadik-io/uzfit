import "server-only";
import { QueryError } from "@/features/discovery/queries";
import { createClient } from "@/lib/supabase/server";

/*
 * Admin reads. Row Level Security grants platform admins (with the second factor when required)
 * read access to operational tables; auth.users details come only through admin_* functions.
 */

function check<T>(result: { data: T; error: { code?: string } | null }): T {
  if (result.error) {
    throw new QueryError(result.error.code);
  }
  return result.data;
}

export interface OperationalTotals {
  collected_minor: number;
  collected_count: number;
  refunded_minor: number;
  refunded_count: number;
  demo_payments_count: number;
  memberships_payment: number;
  memberships_demo: number;
  memberships_admin: number;
  bookings_created: number;
  checkins: number;
  no_shows: number;
  late_cancellations: number;
  venue_cancellations: number;
  orders_needing_reconciliation: number;
  pending_orders: number;
  submitted_revisions: number;
}

export async function getOperationalTotals(from: Date, to: Date): Promise<OperationalTotals> {
  const supabase = await createClient();
  const data = check(
    await supabase.rpc("admin_operational_totals", { p_from: from.toISOString(), p_to: to.toISOString() }),
  );
  return data as unknown as OperationalTotals;
}

export async function listVenues() {
  const supabase = await createClient();
  return (
    check(
      await supabase
        .from("venues")
        .select(
          "id, slug, name, publication_status, operational_status, status_reason, is_demo, organization:organizations(id, name), district:districts(name)",
        )
        .order("slug"),
    ) ?? []
  );
}

export async function listRevisions(status: "submitted" | "reviewed") {
  const supabase = await createClient();
  let query = supabase
    .from("venue_revisions")
    .select(
      "id, status, submitted_at, reviewed_at, review_note, updated_at, venue:venues(id, slug, name, publication_status, organization:organizations(name))",
    )
    .order(status === "submitted" ? "submitted_at" : "reviewed_at", { ascending: status === "submitted" })
    .limit(50);
  query = status === "submitted" ? query.eq("status", "submitted") : query.in("status", ["approved", "rejected"]);
  return check(await query) ?? [];
}

export async function getRevision(revisionId: string) {
  const supabase = await createClient();
  const revision = check(
    await supabase
      .from("venue_revisions")
      .select(
        "id, venue_id, status, content, submitted_at, reviewed_at, review_note, venue:venues(id, slug, name, publication_status, operational_status, organization:organizations(name))",
      )
      .eq("id", revisionId)
      .maybeSingle(),
  );
  return revision;
}

export async function listOrganizations() {
  const supabase = await createClient();
  return (
    check(
      await supabase
        .from("organizations")
        .select("id, name, status, status_reason, is_demo, created_at, organization_members(count), venues(count)")
        .order("name"),
    ) ?? []
  );
}

export async function getOrganization(organizationId: string) {
  const supabase = await createClient();
  return check(
    await supabase
      .from("organizations")
      .select(
        "id, name, status, status_reason, is_demo, created_at, organization_members(user_id, role, created_at, profile:profiles(display_name, anonymized_at)), venues(id, slug, name, publication_status, operational_status)",
      )
      .eq("id", organizationId)
      .maybeSingle(),
  );
}

export async function findUsers(query: string) {
  const supabase = await createClient();
  return check(await supabase.rpc("admin_find_users", { p_query: query || undefined })) ?? [];
}

export async function getUserDetail(userId: string) {
  const supabase = await createClient();
  const [summary, memberships, bookings, orders, roles] = await Promise.all([
    supabase.rpc("admin_user_summary", { p_user_id: userId }).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "id, starts_at, ends_at, status, source, is_demo, grant_reason, revoke_reason, revoked_at, order_id, plan_version:plan_versions(name, version)",
      )
      .eq("user_id", userId)
      .order("starts_at", { ascending: false })
      .limit(20),
    supabase
      .from("bookings")
      .select(
        "id, state, session_starts_at, session_ends_at, cancelled_at, cancellation_source, checked_in_at, venue:venues(slug, name), session:sessions(activity:activities(title))",
      )
      .eq("user_id", userId)
      .order("session_starts_at", { ascending: false })
      .limit(20),
    supabase
      .from("orders")
      .select(
        "id, created_at, status, amount_minor, provider, is_demo, needs_reconciliation, plan_version:plan_versions(name)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("organization_members").select("role, organization:organizations(id, name)").eq("user_id", userId),
  ]);
  const user = check(summary);
  if (!user) {
    return null;
  }
  return {
    user,
    memberships: check(memberships) ?? [],
    bookings: check(bookings) ?? [],
    orders: check(orders) ?? [],
    organizations: check(roles) ?? [],
  };
}

export async function listPublishedPlanVersions() {
  const supabase = await createClient();
  return (
    check(
      await supabase
        .from("plan_versions")
        .select("id, name, version, price_minor, is_demo, plan:plans(code, sort_order)")
        .eq("status", "published"),
    ) ?? []
  ).sort((a, b) => (a.plan?.sort_order ?? 0) - (b.plan?.sort_order ?? 0));
}

export async function listPlans() {
  const supabase = await createClient();
  const [plans, venues] = await Promise.all([
    supabase
      .from("plans")
      .select(
        `id, code, sort_order, is_active,
         plan_versions(id, version, status, name, description, price_minor, duration_days, visit_allowance,
           daily_visit_limit, max_future_bookings, booking_window_days, free_cancellation_minutes, is_demo,
           published_at, retired_at, created_at, plan_version_venues(venue_id))`,
      )
      .order("sort_order"),
    supabase.from("venues").select("id, slug, name, publication_status").order("slug"),
  ]);
  return { plans: check(plans) ?? [], venues: check(venues) ?? [] };
}

export type OrderFilter = "attention" | "all";

export async function listOrders(filter: OrderFilter) {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      "id, user_id, created_at, status, amount_minor, currency, provider, is_demo, needs_reconciliation, reconciliation_note, refund_reference, paid_at, refunded_at, plan_version:plan_versions(name), profile:profiles(display_name), payments(provider_transaction_id, status)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter === "attention") {
    query = query.or("needs_reconciliation.eq.true,status.eq.pending");
  }
  return check(await query) ?? [];
}

export async function listPaymentEvents() {
  const supabase = await createClient();
  return (
    check(
      await supabase
        .from("payment_events")
        .select("id, provider, event_type, outcome, outcome_code, order_id, provider_transaction_id, received_at")
        .order("received_at", { ascending: false })
        .limit(30),
    ) ?? []
  );
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(filters: { action?: string; target?: string; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, actor_id, actor_role, action, target_type, target_id, request_id, reason, before_data, after_data, metadata, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((filters.page - 1) * AUDIT_PAGE_SIZE, filters.page * AUDIT_PAGE_SIZE - 1);
  if (filters.action) {
    query = query.like("action", `${filters.action.replace(/[%_]/g, "")}%`);
  }
  if (filters.target) {
    query = query.eq("target_id", filters.target);
  }
  const { data, error, count } = await query;
  if (error) {
    throw new QueryError(error.code);
  }
  return { rows: data ?? [], total: count ?? 0 };
}
