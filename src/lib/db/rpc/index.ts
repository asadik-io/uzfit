/**
 * Dispatcher for the former database functions. Each function receives the acting user and the
 * in-memory tables, returns the same shape PostgREST produced, and raises domain errors as
 * `P0001` with the stable code as the message so `toDomainError` keeps working.
 */
import type { Actor } from "../core";
import { type DbError, DomainFailure, PERMISSION_DENIED, dbError } from "../errors";
import { rowsWhere } from "../core";
import type { Result } from "../query";
import { cleanupEphemeral, consumeRateLimit, expireStaleOrders, reconcileNoShows, type Store } from "../store";
import * as admin from "./admin";
import type { Args, RpcContext, RpcFunction } from "./context";
import * as member from "./member";
import * as partner from "./partner";
import * as payments from "./payments";

const jobs = {
  reconcile_no_shows: ({ tables }: RpcContext, args: Args) =>
    reconcileNoShows(tables, typeof args.p_limit === "number" ? args.p_limit : 200),
  expire_stale_orders: ({ tables }: RpcContext, args: Args) =>
    expireStaleOrders(tables, typeof args.p_limit === "number" ? args.p_limit : 200),
  cleanup_ephemeral_data: ({ store }: RpcContext) => cleanupEphemeral(store),
  session_occupancy_drift: ({ tables }: RpcContext) =>
    rowsWhere(tables, "sessions", () => true)
      .map((s) => ({
        session_id: String(s.id),
        occupied_count: Number(s.occupied_count),
        live_reservations: rowsWhere(
          tables,
          "bookings",
          (b) => b.session_id === s.id && (b.state === "confirmed" || b.state === "checked_in"),
        ).length,
      }))
      .filter((row) => row.occupied_count !== row.live_reservations),
  consume_rate_limit: ({ store }: RpcContext, args: Args) =>
    consumeRateLimit(
      store,
      String(args.p_bucket ?? ""),
      typeof args.p_max === "number" ? args.p_max : 10,
      typeof args.p_window_seconds === "number" ? args.p_window_seconds : 60,
    ),
};

const FUNCTIONS: Record<string, RpcFunction> = {
  search_venues: member.search_venues,
  get_my_access: member.get_my_access,
  get_my_membership: member.get_my_membership,
  get_my_bookings: member.get_my_bookings,
  get_my_booking: member.get_my_booking,
  create_booking: member.create_booking,
  cancel_booking: member.cancel_booking,
  issue_checkin_token: member.issue_checkin_token,
  create_order: member.create_order,
  mark_notifications_read: member.mark_notifications_read,

  partner_create_venue: partner.partner_create_venue,
  partner_save_venue_revision: partner.partner_save_venue_revision,
  partner_submit_venue_revision: partner.partner_submit_venue_revision,
  partner_withdraw_venue_revision: partner.partner_withdraw_venue_revision,
  partner_create_activity: partner.partner_create_activity,
  partner_update_activity: partner.partner_update_activity,
  partner_create_sessions: partner.partner_create_sessions,
  partner_update_session_capacity: partner.partner_update_session_capacity,
  cancel_session: partner.cancel_session,
  get_session_roster: partner.get_session_roster,
  partner_day_sessions: partner.partner_day_sessions,
  partner_attendance_report: partner.partner_attendance_report,
  redeem_checkin_token: partner.redeem_checkin_token,

  admin_set_venue_status: admin.admin_set_venue_status,
  admin_review_venue_revision: admin.admin_review_venue_revision,
  admin_create_organization: admin.admin_create_organization,
  admin_set_organization_status: admin.admin_set_organization_status,
  admin_set_org_member: admin.admin_set_org_member,
  admin_remove_org_member: admin.admin_remove_org_member,
  admin_find_users: admin.admin_find_users,
  admin_user_summary: admin.admin_user_summary,
  admin_set_account_status: admin.admin_set_account_status,
  admin_anonymize_user: admin.admin_anonymize_user,
  admin_grant_membership: admin.admin_grant_membership,
  admin_revoke_membership: admin.admin_revoke_membership,
  admin_correct_booking: admin.admin_correct_booking,
  admin_create_plan: admin.admin_create_plan,
  admin_create_plan_version: admin.admin_create_plan_version,
  admin_delete_plan_version_draft: admin.admin_delete_plan_version_draft,
  admin_publish_plan_version: admin.admin_publish_plan_version,
  admin_retire_plan_version: admin.admin_retire_plan_version,
  admin_operational_totals: admin.admin_operational_totals,
  admin_record_refund: admin.admin_record_refund,
  admin_resolve_reconciliation: admin.admin_resolve_reconciliation,

  apply_payment_event: payments.apply_payment_event,
  get_order_for_payment: payments.get_order_for_payment,
  list_orders_for_reconciliation: payments.list_orders_for_reconciliation,
  expire_stale_orders: jobs.expire_stale_orders,
  reconcile_no_shows: jobs.reconcile_no_shows,
  cleanup_ephemeral_data: jobs.cleanup_ephemeral_data,
  session_occupancy_drift: jobs.session_occupancy_drift,
  consume_rate_limit: jobs.consume_rate_limit,
};

/** Functions the privileged server key alone could execute. */
const SERVICE_ONLY = new Set([
  "apply_payment_event",
  "get_order_for_payment",
  "list_orders_for_reconciliation",
  "expire_stale_orders",
  "reconcile_no_shows",
  "cleanup_ephemeral_data",
  "session_occupancy_drift",
  "consume_rate_limit",
]);
/** Functions visitors may call without signing in. */
const ANON_ALLOWED = new Set(["search_venues"]);

export function callRpc(store: Store, actor: Actor, name: string, args: Args | undefined): Result<unknown> {
  const fn = FUNCTIONS[name];
  if (!fn) {
    return failure(dbError("PGRST202", `Could not find the function public.${name} in the schema cache`), 404);
  }
  if (actor.role !== "service_role") {
    if (SERVICE_ONLY.has(name) || (actor.role === "anon" && !ANON_ALLOWED.has(name))) {
      return failure(PERMISSION_DENIED, 403);
    }
  }
  try {
    const data = fn({ actor, store, tables: store.tables }, args ?? {});
    return { data: data === undefined ? null : data, error: null, count: null, status: 200, statusText: "OK" };
  } catch (error) {
    if (error instanceof DomainFailure) {
      return failure(error.toDbError(), 400);
    }
    throw error;
  }
}

function failure(error: DbError, status: number): Result<unknown> {
  return { data: null, error, count: null, status, statusText: status === 403 ? "Forbidden" : "Bad Request" };
}
