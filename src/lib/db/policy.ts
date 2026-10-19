/**
 * Row visibility and direct-write rules: a port of the former Row Level Security policies and
 * table grants. Service-role access (jobs, payment processing) bypasses them like before.
 */
import {
  type Actor,
  canReadPlanVersion,
  canReadVenue,
  hasOrgRole,
  hasVenueRole,
  isOrgActive,
  isPlatformAdmin,
  isVenuePublic,
  ownsPlanVersion,
} from "./core";
import { type DbError, PERMISSION_DENIED, dbError } from "./errors";
import type { EngineHooks, Row, Tables, WriteOp } from "./query";

const PUBLIC_TABLES = new Set(["cities", "districts", "categories", "amenities"]);
const VENUE_CHILDREN = new Set([
  "venue_categories",
  "venue_amenities",
  "venue_images",
  "venue_opening_hours",
  "activities",
  "sessions",
]);
const OWN_TABLES = new Set(["memberships", "bookings", "orders"]);

export function visibleTo(tables: Tables, actor: Actor, table: string, row: Row): boolean {
  if (actor.role === "service_role") return true;
  if (PUBLIC_TABLES.has(table)) return true;
  const uid = actor.uid;
  const admin = () => isPlatformAdmin(tables, actor);
  if (table === "venues") {
    return (
      (row.publication_status === "published" &&
        row.operational_status === "active" &&
        isOrgActive(tables, row.organization_id)) ||
      hasOrgRole(tables, actor, row.organization_id, null) ||
      admin()
    );
  }
  if (VENUE_CHILDREN.has(table)) return canReadVenue(tables, actor, row.venue_id);
  if (table === "plans") return row.is_active === true || admin();
  if (table === "plan_versions") return row.status === "published" || ownsPlanVersion(tables, actor, row.id) || admin();
  if (table === "plan_version_venues") {
    return canReadPlanVersion(tables, actor, row.plan_version_id) && canReadVenue(tables, actor, row.venue_id);
  }
  if (!uid) return false;
  if (table === "venue_revisions") return hasVenueRole(tables, actor, row.venue_id, ["manager"]) || admin();
  if (table === "profiles") return row.id === uid || admin();
  if (table === "account_statuses" || table === "platform_roles" || table === "organization_members") {
    return row.user_id === uid || admin();
  }
  if (table === "organizations") return hasOrgRole(tables, actor, row.id, null) || admin();
  if (OWN_TABLES.has(table)) return row.user_id === uid || admin();
  if (table === "checkins") {
    return admin() || tables.bookings!.some((b) => b.id === row.booking_id && b.user_id === uid);
  }
  if (table === "payments") {
    return admin() || tables.orders!.some((o) => o.id === row.order_id && o.user_id === uid);
  }
  if (table === "payment_events" || table === "audit_logs") return admin();
  if (table === "favorites" || table === "notifications") return row.user_id === uid;
  // checkin_tokens, auth_users: functions only.
  return false;
}

const PROFILE_COLUMNS = new Set(["display_name", "phone_e164", "locale"]);

export function authorizeWriteFor(
  tables: Tables,
  actor: Actor,
  op: WriteOp,
  table: string,
  rows: Row[],
  patch: Row | null,
): DbError | null {
  if (actor.role === "service_role") return null;
  const uid = actor.uid;
  if (!uid) return PERMISSION_DENIED;
  if (table === "favorites") {
    if (op === "insert" || op === "upsert") {
      return rows.every((r) => r.user_id === uid && isVenuePublic(tables, r.venue_id))
        ? null
        : dbError("42501", 'new row violates row-level security policy for table "favorites"');
    }
    if (op === "delete") return rows.every((r) => r.user_id === uid) ? null : PERMISSION_DENIED;
    return PERMISSION_DENIED;
  }
  if (table === "profiles" && op === "update") {
    const allowed = Object.keys(patch ?? {}).every((k) => PROFILE_COLUMNS.has(k));
    return allowed && rows.every((r) => r.id === uid) ? null : PERMISSION_DENIED;
  }
  if (table === "notifications" && op === "update") {
    const allowed = Object.keys(patch ?? {}).every((k) => k === "read_at");
    return allowed && rows.every((r) => r.user_id === uid) ? null : PERMISSION_DENIED;
  }
  return PERMISSION_DENIED;
}

export function createHooks(tables: Tables, actor: Actor): EngineHooks {
  return {
    visible: (table, row) => visibleTo(tables, actor, table, row),
    authorizeWrite: (op, table, rows, patch) => authorizeWriteFor(tables, actor, op, table, rows, patch),
    onMutate: () => {},
  };
}
