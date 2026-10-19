/**
 * Domain primitives shared by the seed and the database functions: authorization predicates,
 * booking state changes with occupancy maintenance, notifications, audit entries, membership
 * usage, venue cancellation, membership revocation and venue content validation. They are
 * direct ports of the former `private.*` SQL helpers and operate on the raw in-memory tables.
 */
import type { Json } from "./database.types";
import { fail } from "./errors";
import { newId } from "./ids";
import { type Row, type Tables, withDefaults } from "./query";

export type Actor = {
  uid: string | null;
  aal: "aal1" | "aal2";
  role: "anon" | "authenticated" | "service_role";
  requestId: string | null;
};

export const ADMIN_MFA_REQUIRED = false;
export const DEMO_PAYMENTS_ENABLED = true;

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

/* ---------- lookups ---------- */

export function byId(tables: Tables, table: string, id: unknown): Row | undefined {
  return tables[table]?.find((r) => r.id === id);
}

export function rowsWhere(tables: Tables, table: string, predicate: (row: Row) => boolean): Row[] {
  return (tables[table] ?? []).filter(predicate);
}

export function insertRow(tables: Tables, table: string, row: Row): Row {
  const prepared = withDefaults(table, row);
  (tables[table] ??= []).push(prepared);
  return prepared;
}

export function deleteWhere(tables: Tables, table: string, predicate: (row: Row) => boolean): number {
  const rows = tables[table] ?? [];
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (predicate(rows[i]!)) {
      rows.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

export function touch(table: string, row: Row): void {
  if (
    [
      "activities",
      "bookings",
      "orders",
      "organizations",
      "payments",
      "profiles",
      "sessions",
      "venue_revisions",
      "venues",
      "account_statuses",
    ].includes(table)
  ) {
    row.updated_at = nowIso();
  }
}

/* ---------- authorization predicates (ports of private.*) ---------- */

export function isAccountActive(tables: Tables, uid: string | null): boolean {
  if (!uid) return false;
  return rowsWhere(tables, "account_statuses", (s) => s.user_id === uid && s.status === "active").length > 0;
}

export function hasAdminRole(tables: Tables, uid: string | null): boolean {
  if (!uid) return false;
  return (
    rowsWhere(tables, "platform_roles", (r) => r.user_id === uid && r.role === "admin").length > 0 &&
    isAccountActive(tables, uid)
  );
}

export function isPlatformAdmin(tables: Tables, actor: Actor): boolean {
  return hasAdminRole(tables, actor.uid) && (!ADMIN_MFA_REQUIRED || actor.aal === "aal2");
}

export function isOrgActive(tables: Tables, orgId: unknown): boolean {
  return rowsWhere(tables, "organizations", (o) => o.id === orgId && o.status === "active").length > 0;
}

export function hasOrgRole(tables: Tables, actor: Actor, orgId: unknown, roles: string[] | null): boolean {
  if (!actor.uid) return false;
  const member = rowsWhere(
    tables,
    "organization_members",
    (m) => m.organization_id === orgId && m.user_id === actor.uid && (roles === null || roles.includes(String(m.role))),
  );
  return member.length > 0 && isOrgActive(tables, orgId) && isAccountActive(tables, actor.uid);
}

export function hasVenueRole(tables: Tables, actor: Actor, venueId: unknown, roles: string[] | null): boolean {
  const venue = byId(tables, "venues", venueId);
  return Boolean(venue) && hasOrgRole(tables, actor, venue!.organization_id, roles);
}

export function isVenuePublic(tables: Tables, venueId: unknown): boolean {
  const venue = byId(tables, "venues", venueId);
  return Boolean(
    venue &&
    venue.publication_status === "published" &&
    venue.operational_status === "active" &&
    isOrgActive(tables, venue.organization_id),
  );
}

export function canReadVenue(tables: Tables, actor: Actor, venueId: unknown): boolean {
  return isVenuePublic(tables, venueId) || hasVenueRole(tables, actor, venueId, null) || isPlatformAdmin(tables, actor);
}

export function ownsPlanVersion(tables: Tables, actor: Actor, planVersionId: unknown): boolean {
  if (!actor.uid) return false;
  return (
    rowsWhere(tables, "memberships", (m) => m.plan_version_id === planVersionId && m.user_id === actor.uid).length >
      0 || rowsWhere(tables, "orders", (o) => o.plan_version_id === planVersionId && o.user_id === actor.uid).length > 0
  );
}

export function canReadPlanVersion(tables: Tables, actor: Actor, planVersionId: unknown): boolean {
  const pv = byId(tables, "plan_versions", planVersionId);
  return (
    Boolean(pv && pv.status === "published") ||
    ownsPlanVersion(tables, actor, planVersionId) ||
    isPlatformAdmin(tables, actor)
  );
}

/** Returns the member's account status, creating the coordination row when missing. */
export function lockMember(tables: Tables, uid: string): string {
  const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === uid)[0];
  if (status) return String(status.status);
  if (!byId(tables, "profiles", uid)) fail("USER_NOT_FOUND");
  const created = insertRow(tables, "account_statuses", {
    user_id: uid,
    status: "active",
    reason: null,
    updated_by: null,
  });
  return String(created.status);
}

export function requireUid(actor: Actor): string {
  if (!actor.uid) fail("AUTH_REQUIRED");
  return actor.uid;
}

export function requireStaffAccount(tables: Tables, actor: Actor): string {
  const uid = requireUid(actor);
  if (!isAccountActive(tables, uid)) fail("ACCOUNT_SUSPENDED");
  return uid;
}

export function requireAdmin(tables: Tables, actor: Actor): string {
  const uid = requireUid(actor);
  if (!hasAdminRole(tables, uid)) fail("FORBIDDEN");
  if (!isPlatformAdmin(tables, actor)) fail("MFA_REQUIRED");
  return uid;
}

export function requireReason(reason: unknown): string {
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) fail("REASON_REQUIRED");
  return reason.trim();
}

/* ---------- audit and notifications ---------- */

export function audit(
  tables: Tables,
  actor: Actor,
  actorRole: "member" | "staff" | "admin" | "system",
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string | null = null,
  before: Json | null = null,
  after: Json | null = null,
  metadata: Json = {},
): void {
  insertRow(tables, "audit_logs", {
    actor_id: actor.uid,
    actor_role: actorRole,
    action,
    target_type: targetType,
    target_id: targetId,
    request_id: actor.requestId,
    reason,
    before_data: before,
    after_data: after,
    metadata: metadata ?? {},
  });
}

export function notify(tables: Tables, userId: string, key: string, params: Json = {}): void {
  insertRow(tables, "notifications", { user_id: userId, message_key: key, params: params ?? {}, read_at: null });
}

export function bookingNoticeParams(tables: Tables, bookingId: unknown): Json {
  const booking = byId(tables, "bookings", bookingId);
  if (!booking) return {};
  const session = byId(tables, "sessions", booking.session_id);
  const activity = session ? byId(tables, "activities", session.activity_id) : undefined;
  const venue = byId(tables, "venues", booking.venue_id);
  return {
    booking_id: String(booking.id),
    venue_name: (venue?.name as Json) ?? null,
    activity_title: (activity?.title as Json) ?? null,
    starts_at: String(booking.session_starts_at),
    timezone: String(venue?.timezone ?? "Asia/Tashkent"),
  };
}

/* ---------- bookings and occupancy ---------- */

const OCCUPYING = new Set(["confirmed", "checked_in"]);

export function membershipUsage(tables: Tables, membershipId: unknown): { consumed: number; reserved: number } {
  let consumed = 0;
  let reserved = 0;
  for (const b of rowsWhere(tables, "bookings", (b) => b.membership_id === membershipId)) {
    if (b.state === "checked_in" || b.state === "cancelled_late" || b.state === "no_show") consumed++;
    if (b.state === "confirmed") reserved++;
  }
  return { consumed, reserved };
}

function adjustOccupancy(tables: Tables, sessionId: unknown, delta: number): void {
  const session = byId(tables, "sessions", sessionId);
  if (!session) return;
  session.occupied_count = Math.max(0, Number(session.occupied_count ?? 0) + delta);
  touch("sessions", session);
}

/** Inserts a booking row and maintains the session's occupied_count. */
export function insertBooking(tables: Tables, booking: Row): Row {
  const row = insertRow(tables, "bookings", {
    state: "confirmed",
    cancelled_at: null,
    cancelled_by: null,
    cancellation_source: null,
    cancellation_reason: null,
    checked_in_at: null,
    finalized_at: null,
    ...booking,
  });
  if (OCCUPYING.has(String(row.state))) adjustOccupancy(tables, row.session_id, 1);
  return row;
}

/** Changes a booking's state and keeps the session occupancy in sync. */
export function setBookingState(tables: Tables, booking: Row, state: string, patch: Row = {}): void {
  const wasOccupying = OCCUPYING.has(String(booking.state));
  const willOccupy = OCCUPYING.has(state);
  Object.assign(booking, patch, { state });
  touch("bookings", booking);
  if (willOccupy && !wasOccupying) adjustOccupancy(tables, booking.session_id, 1);
  if (wasOccupying && !willOccupy) adjustOccupancy(tables, booking.session_id, -1);
}

export function revokeOpenTokens(tables: Tables, bookingId: unknown, at: string): void {
  for (const token of rowsWhere(
    tables,
    "checkin_tokens",
    (t) => t.booking_id === bookingId && t.used_at === null && t.revoked_at === null,
  )) {
    token.revoked_at = at;
  }
}

/** Venue-side cancellation of sessions: releases confirmed reservations, notifies members. */
export function venueCancelSessions(
  tables: Tables,
  actor: Actor,
  sessionIds: string[],
  reason: string,
  actorRole: "staff" | "admin",
  source: "venue" | "admin",
): number {
  const at = nowIso();
  for (const session of rowsWhere(
    tables,
    "sessions",
    (s) => sessionIds.includes(String(s.id)) && s.status === "scheduled",
  )) {
    Object.assign(session, {
      status: "cancelled",
      cancellation_reason: reason,
      cancelled_at: at,
      cancelled_by: actor.uid,
    });
    touch("sessions", session);
  }
  let released = 0;
  for (const booking of rowsWhere(
    tables,
    "bookings",
    (b) => sessionIds.includes(String(b.session_id)) && b.state === "confirmed",
  )) {
    setBookingState(tables, booking, "venue_cancelled", {
      cancelled_at: at,
      cancelled_by: actor.uid,
      cancellation_source: source,
      cancellation_reason: reason,
    });
    released++;
    revokeOpenTokens(tables, booking.id, at);
    notify(tables, String(booking.user_id), "booking_venue_cancelled", {
      ...(bookingNoticeParams(tables, booking.id) as Record<string, Json>),
      reason,
    });
  }
  audit(tables, actor, actorRole, "session.cancel", "session", sessionIds.join(","), reason, null, null, {
    released_bookings: released,
  });
  return released;
}

/** Revokes a membership and releases its future confirmed reservations. */
export function revokeMembershipCore(
  tables: Tables,
  actor: Actor,
  membershipId: unknown,
  reason: string,
  actorRole: "admin" | "system",
): number {
  const membership = byId(tables, "memberships", membershipId);
  if (!membership) fail("MEMBERSHIP_NOT_FOUND");
  if (membership.status === "revoked") return 0;
  const at = nowIso();
  let released = 0;
  for (const booking of rowsWhere(
    tables,
    "bookings",
    (b) => b.membership_id === membershipId && b.state === "confirmed" && String(b.session_ends_at) > at,
  )) {
    setBookingState(tables, booking, "cancelled_on_time", {
      cancelled_at: at,
      cancelled_by: actor.uid,
      cancellation_source: "admin",
      cancellation_reason: "membership_revoked",
    });
    revokeOpenTokens(tables, booking.id, at);
    released++;
  }
  Object.assign(membership, { status: "revoked", revoked_at: at, revoked_by: actor.uid, revoke_reason: reason });
  notify(tables, String(membership.user_id), "membership_revoked", {
    membership_id: String(membership.id),
    released_bookings: released,
  });
  audit(
    tables,
    actor,
    actorRole,
    "membership.revoke",
    "membership",
    String(membership.id),
    reason,
    { status: "active" },
    { status: "revoked" },
    { released_bookings: released, user_id: String(membership.user_id) },
  );
  return released;
}

/* ---------- validation helpers ---------- */

export function isLocalizedText(value: unknown, maxLength = 200, requireUz = true): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (!["uz", "ru", "en"].includes(key) || typeof text !== "string" || text.length > maxLength) return false;
  }
  if (requireUz) {
    const uz = (value as Record<string, unknown>).uz;
    return typeof uz === "string" && uz.trim().length > 0;
  }
  return true;
}

export function isValidPhone(phone: unknown): boolean {
  if (typeof phone !== "string") return false;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) && (!phone.startsWith("+998") || /^\+998[0-9]{9}$/.test(phone));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tryUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const CLOSE_RE = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/;

/** Port of private.validate_venue_content: returns the normalized content or fails with a field. */
export function validateVenueContent(tables: Tables, venueId: string, content: unknown): Record<string, Json> {
  if (typeof content !== "object" || content === null || Array.isArray(content)) fail("INVALID_CONTENT", "content");
  const c = content as Record<string, unknown>;
  if (!isLocalizedText(c.name, 120)) fail("INVALID_CONTENT", "name");
  if (!isLocalizedText(c.address, 300)) fail("INVALID_CONTENT", "address");
  if (!isLocalizedText(c.description ?? { uz: "" }, 4000, false)) fail("INVALID_CONTENT", "description");
  if (!isLocalizedText(c.rules ?? { uz: "" }, 4000, false)) fail("INVALID_CONTENT", "rules");
  const districtId = tryUuid(c.district_id);
  if (!districtId || !byId(tables, "districts", districtId)) fail("INVALID_CONTENT", "district_id");

  const lat = c.latitude ?? null;
  const lng = c.longitude ?? null;
  if ((lat === null) !== (lng === null)) fail("INVALID_CONTENT", "coordinates");
  if (lat !== null) {
    if (typeof lat !== "number" || typeof lng !== "number" || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      fail("INVALID_CONTENT", "coordinates");
    }
  }
  if (c.contact_phone !== undefined && c.contact_phone !== null && !isValidPhone(c.contact_phone)) {
    fail("INVALID_CONTENT", "contact_phone");
  }

  const categoryIds = (c.category_ids ?? []) as unknown;
  if (!Array.isArray(categoryIds) || categoryIds.length < 1 || categoryIds.length > 6)
    fail("INVALID_CONTENT", "category_ids");
  if (!categoryIds.every((id) => tryUuid(id) && byId(tables, "categories", tryUuid(id))))
    fail("INVALID_CONTENT", "category_ids");

  const amenityIds = (c.amenity_ids ?? []) as unknown;
  if (!Array.isArray(amenityIds) || amenityIds.length > 20) fail("INVALID_CONTENT", "amenity_ids");
  if (!amenityIds.every((id) => tryUuid(id) && byId(tables, "amenities", tryUuid(id))))
    fail("INVALID_CONTENT", "amenity_ids");

  const images = (c.images ?? []) as unknown;
  if (!Array.isArray(images) || images.length > 12) fail("INVALID_CONTENT", "images");
  const pathRe = new RegExp(`^venues/${venueId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  for (const item of images) {
    if (typeof item !== "object" || item === null) fail("INVALID_CONTENT", "images");
    const image = item as Record<string, unknown>;
    if (typeof image.path !== "string" || !pathRe.test(image.path)) fail("INVALID_CONTENT", "images");
    if (!isLocalizedText(image.alt ?? { uz: "" }, 200, false)) fail("INVALID_CONTENT", "images");
  }

  const hours = (c.opening_hours ?? []) as unknown;
  if (!Array.isArray(hours) || hours.length !== 7) fail("INVALID_CONTENT", "opening_hours");
  const seen = new Set<number>();
  for (const item of hours) {
    if (typeof item !== "object" || item === null) fail("INVALID_CONTENT", "opening_hours");
    const day = item as Record<string, unknown>;
    if (typeof day.weekday !== "number" || day.weekday < 1 || day.weekday > 7 || seen.has(day.weekday)) {
      fail("INVALID_CONTENT", "opening_hours");
    }
    seen.add(day.weekday);
    if (!day.is_closed) {
      const opens = String(day.opens_at ?? "");
      const closes = String(day.closes_at ?? "");
      if (!TIME_RE.test(opens) || !CLOSE_RE.test(closes) || opens >= closes) fail("INVALID_CONTENT", "opening_hours");
    }
  }

  return {
    name: c.name as Json,
    address: c.address as Json,
    description: (c.description ?? { uz: "" }) as Json,
    rules: (c.rules ?? { uz: "" }) as Json,
    district_id: districtId,
    latitude: (lat ?? null) as Json,
    longitude: (lng ?? null) as Json,
    contact_phone: (c.contact_phone ?? null) as Json,
    category_ids: categoryIds as Json,
    amenity_ids: amenityIds as Json,
    images: images as Json,
    opening_hours: hours as Json,
  };
}

export { newId };

/** Mirrors the generated `venues.search_text` column (lower-cased names in all languages). */
export function venueSearchText(name: unknown): string {
  const n = (typeof name === "object" && name !== null ? name : {}) as Record<string, unknown>;
  return `${n.uz ?? ""} ${n.ru ?? ""} ${n.en ?? ""}`.toLowerCase();
}

/** Clamps a page size the way the SQL functions did. */
export function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(n, min), max);
}
