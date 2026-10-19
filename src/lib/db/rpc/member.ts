/**
 * Member-facing functions: catalog search, entitlement summaries and the transactional booking,
 * cancellation, check-in token and checkout operations. Ports of the former SQL functions; the
 * acting user always comes from the verified session, never from arguments.
 */
import { createHash, randomBytes } from "node:crypto";
import { localDateString, localDayRange } from "@/lib/time";
import {
  addDaysIso,
  addMinutes,
  audit,
  bookingNoticeParams,
  byId,
  clamp,
  DEMO_PAYMENTS_ENABLED,
  hasAdminRole,
  insertBooking,
  insertRow,
  isPlatformAdmin,
  isVenuePublic,
  lockMember,
  membershipUsage,
  minIso,
  notify,
  nowIso,
  requireUid,
  revokeOpenTokens,
  rowsWhere,
  setBookingState,
} from "../core";
import { ADMIN_MFA_REQUIRED } from "../core";
import type { Json } from "../database.types";
import { fail } from "../errors";
import type { Row } from "../query";
import { consumeRateLimit } from "../store";
import type { Args, RpcContext } from "./context";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function localizedName(name: unknown, locale: string): string {
  const n = (name ?? {}) as Record<string, string>;
  return n[locale] ?? n.uz ?? "";
}

export function search_venues({ tables }: RpcContext, args: Args) {
  const query = String(args.p_query ?? "")
    .trim()
    .slice(0, 80)
    .toLowerCase();
  const locale = String(args.p_locale ?? "uz");
  const now = nowIso();
  const lat = typeof args.p_lat === "number" ? args.p_lat : null;
  const lng = typeof args.p_lng === "number" ? args.p_lng : null;

  const base = rowsWhere(tables, "venues", (v) => {
    if (v.publication_status !== "published" || v.operational_status !== "active" || !isVenuePublic(tables, v.id)) {
      return false;
    }
    const district = byId(tables, "districts", v.district_id);
    const city = district ? byId(tables, "cities", district.city_id) : undefined;
    if (args.p_city && city?.slug !== args.p_city) return false;
    if (args.p_district && district?.slug !== args.p_district) return false;
    if (query) {
      const districtText = Object.values((district?.name ?? {}) as Record<string, string>)
        .join(" ")
        .toLowerCase();
      if (!String(v.search_text ?? "").includes(query) && !districtText.includes(query)) return false;
    }
    if (args.p_category) {
      const match = rowsWhere(tables, "venue_categories", (vc) => vc.venue_id === v.id).some(
        (vc) => byId(tables, "categories", vc.category_id)?.slug === args.p_category,
      );
      if (!match) return false;
    }
    if (args.p_plan) {
      const match = rowsWhere(tables, "plan_version_venues", (x) => x.venue_id === v.id).some((x) => {
        const pv = byId(tables, "plan_versions", x.plan_version_id);
        const plan = pv ? byId(tables, "plans", pv.plan_id) : undefined;
        return pv?.status === "published" && plan?.is_active === true && plan.code === args.p_plan;
      });
      if (!match) return false;
    }
    if (typeof args.p_date === "string") {
      const { start, end } = localDayRange(args.p_date, String(v.timezone));
      const match = rowsWhere(
        tables,
        "sessions",
        (s) =>
          s.venue_id === v.id &&
          s.status === "scheduled" &&
          String(s.starts_at) >= start.toISOString() &&
          String(s.starts_at) < end.toISOString() &&
          String(s.starts_at) > now,
      );
      if (match.length === 0) return false;
    }
    return true;
  });

  const rows = base.map((v) => {
    const district = byId(tables, "districts", v.district_id);
    const city = district ? byId(tables, "cities", district.city_id) : undefined;
    const cover = rowsWhere(tables, "venue_images", (i) => i.venue_id === v.id).sort(
      (a, b) => Number(a.sort_order) - Number(b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)),
    )[0];
    const categorySlugs = rowsWhere(tables, "venue_categories", (vc) => vc.venue_id === v.id)
      .map((vc) => byId(tables, "categories", vc.category_id))
      .filter((c): c is Row => Boolean(c))
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((c) => String(c.slug));
    const planCodes = [
      ...new Set(
        rowsWhere(tables, "plan_version_venues", (x) => x.venue_id === v.id)
          .map((x) => {
            const pv = byId(tables, "plan_versions", x.plan_version_id);
            const plan = pv ? byId(tables, "plans", pv.plan_id) : undefined;
            return pv?.status === "published" && plan?.is_active === true ? plan : undefined;
          })
          .filter((p): p is Row => Boolean(p))
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
          .map((p) => String(p.code)),
      ),
    ];
    const distance =
      lat !== null && lng !== null && typeof v.latitude === "number" && typeof v.longitude === "number"
        ? haversineKm(lat, lng, v.latitude, v.longitude)
        : null;
    return {
      id: String(v.id),
      slug: String(v.slug),
      name: v.name as Json,
      address: v.address as Json,
      district_slug: String(district?.slug ?? ""),
      district_name: (district?.name ?? {}) as Json,
      city_slug: String(city?.slug ?? ""),
      cover_path: cover ? String(cover.storage_path) : null,
      cover_alt: (cover?.alt ?? null) as Json,
      category_slugs: categorySlugs,
      plan_codes: planCodes,
      latitude: (v.latitude as number | null) ?? null,
      longitude: (v.longitude as number | null) ?? null,
      distance_km: distance,
      is_demo: Boolean(v.is_demo),
      total_count: base.length,
    };
  });
  rows.sort((a, b) => {
    if (a.distance_km !== null || b.distance_km !== null) {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
    }
    const byName = localizedName(a.name, locale).localeCompare(localizedName(b.name, locale));
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
  const limit = clamp(args.p_limit, 12, 1, 48);
  const offset = Math.max(typeof args.p_offset === "number" ? args.p_offset : 0, 0);
  return rows.slice(offset, offset + limit);
}

export function get_my_access({ tables, actor }: RpcContext) {
  if (!actor.uid) return [];
  const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === actor.uid)[0];
  if (!status) return [];
  const organizations = rowsWhere(tables, "organization_members", (m) => m.user_id === actor.uid)
    .map((m) => ({ member: m, org: byId(tables, "organizations", m.organization_id) }))
    .filter((x): x is { member: Row; org: Row } => Boolean(x.org))
    .sort((a, b) => String(a.org.name).localeCompare(String(b.org.name)))
    .map(({ member, org }) => ({ id: String(org.id), name: String(org.name), status: org.status, role: member.role }));
  return [
    {
      user_id: actor.uid,
      account_status: status.status,
      has_admin_role: hasAdminRole(tables, actor.uid),
      admin_mfa_required: ADMIN_MFA_REQUIRED,
      admin_authorized: isPlatformAdmin(tables, actor),
      organizations: organizations as unknown as Json,
    },
  ];
}

export function currentMembership(ctx: RpcContext, uid: string, at = nowIso()): Row | undefined {
  return rowsWhere(
    ctx.tables,
    "memberships",
    (m) => m.user_id === uid && m.status === "active" && String(m.starts_at) <= at && at < String(m.ends_at),
  ).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)))[0];
}

export function get_my_membership(ctx: RpcContext) {
  const { tables, actor } = ctx;
  if (!actor.uid) return [];
  const now = nowIso();
  const m = currentMembership(ctx, actor.uid, now);
  if (!m) return [];
  const pv = byId(tables, "plan_versions", m.plan_version_id)!;
  const plan = byId(tables, "plans", pv.plan_id)!;
  const usage = membershipUsage(tables, m.id);
  return [
    {
      membership_id: String(m.id),
      plan_version_id: String(pv.id),
      plan_code: String(plan.code),
      plan_name: pv.name as Json,
      plan_version: Number(pv.version),
      starts_at: String(m.starts_at),
      ends_at: String(m.ends_at),
      source: m.source,
      is_demo: Boolean(m.is_demo),
      visit_allowance: Number(pv.visit_allowance),
      consumed: usage.consumed,
      reserved: usage.reserved,
      available: Math.max(Number(pv.visit_allowance) - usage.consumed - usage.reserved, 0),
      daily_visit_limit: Number(pv.daily_visit_limit),
      max_future_bookings: Number(pv.max_future_bookings),
      booking_window_days: Number(pv.booking_window_days),
      free_cancellation_minutes: Number(pv.free_cancellation_minutes),
      upcoming_count: rowsWhere(
        tables,
        "bookings",
        (b) => b.user_id === actor.uid && b.state === "confirmed" && String(b.session_ends_at) > now,
      ).length,
      eligible_venue_count: rowsWhere(
        tables,
        "plan_version_venues",
        (x) => x.plan_version_id === pv.id && isVenuePublic(tables, x.venue_id),
      ).length,
    },
  ];
}

function bookingView(ctx: RpcContext, b: Row) {
  const { tables } = ctx;
  const session = byId(tables, "sessions", b.session_id)!;
  const activity = byId(tables, "activities", session.activity_id)!;
  const venue = byId(tables, "venues", b.venue_id)!;
  return {
    booking_id: String(b.id),
    state: b.state,
    local_date: String(b.local_date),
    session_id: String(b.session_id),
    session_starts_at: String(b.session_starts_at),
    session_ends_at: String(b.session_ends_at),
    cancellation_deadline: String(b.cancellation_deadline),
    checkin_opens_at: String(b.checkin_opens_at),
    checkin_closes_at: String(b.checkin_closes_at),
    venue_id: String(venue.id),
    venue_slug: String(venue.slug),
    venue_name: venue.name as Json,
    venue_address: venue.address as Json,
    venue_timezone: String(venue.timezone),
    activity_title: activity.title as Json,
    activity_kind: activity.kind,
    session_status: session.status,
    session_cancellation_reason: (session.cancellation_reason as string | null) ?? null,
    cancelled_at: (b.cancelled_at as string | null) ?? null,
    cancellation_source: b.cancellation_source ?? null,
    cancellation_reason: (b.cancellation_reason as string | null) ?? null,
    checked_in_at: (b.checked_in_at as string | null) ?? null,
    created_at: String(b.created_at),
    membership_id: String(b.membership_id),
  };
}

export function get_my_bookings(ctx: RpcContext, args: Args) {
  const { tables, actor } = ctx;
  if (!actor.uid) return [];
  const scope = String(args.p_scope ?? "upcoming");
  const now = nowIso();
  const isUpcoming = (b: Row) => b.state === "confirmed" && String(b.session_ends_at) > now;
  const all = rowsWhere(
    tables,
    "bookings",
    (b) =>
      b.user_id === actor.uid && (scope === "upcoming" ? isUpcoming(b) : scope === "past" ? !isUpcoming(b) : false),
  ).sort((a, b) => {
    const cmp = String(a.session_starts_at).localeCompare(String(b.session_starts_at));
    return (scope === "upcoming" ? cmp : -cmp) || String(a.id).localeCompare(String(b.id));
  });
  const limit = clamp(args.p_limit, 20, 1, 100);
  const offset = Math.max(typeof args.p_offset === "number" ? args.p_offset : 0, 0);
  return all.slice(offset, offset + limit).map((b) => ({ ...bookingView(ctx, b), total_count: all.length }));
}

export function get_my_booking(ctx: RpcContext, args: Args) {
  const { tables, actor } = ctx;
  if (!actor.uid) return [];
  const b = rowsWhere(tables, "bookings", (x) => x.id === args.p_booking_id && x.user_id === actor.uid)[0];
  if (!b) return [];
  const membership = byId(tables, "memberships", b.membership_id);
  const pv = membership ? byId(tables, "plan_versions", membership.plan_version_id) : undefined;
  const snapshot = (b.policy_snapshot ?? {}) as Record<string, unknown>;
  return [
    {
      ...bookingView(ctx, b),
      plan_name: (pv?.name ?? null) as Json,
      free_cancellation_minutes: Number(snapshot.free_cancellation_minutes ?? pv?.free_cancellation_minutes ?? 120),
      server_now: nowIso(),
    },
  ];
}

export function create_booking(ctx: RpcContext, args: Args) {
  const { tables, actor } = ctx;
  const uid = requireUid(actor);
  const now = nowIso();
  if (!args.p_session_id || !args.p_idempotency_key) fail("VALIDATION_FAILED");
  const status = lockMember(tables, uid);

  const existing = rowsWhere(
    tables,
    "bookings",
    (b) => b.user_id === uid && b.idempotency_key === args.p_idempotency_key,
  )[0];
  if (existing) {
    if (existing.session_id !== args.p_session_id) fail("IDEMPOTENCY_KEY_REUSED");
    return [{ booking_id: String(existing.id), booking_state: existing.state, replayed: true }];
  }
  if (status !== "active") fail("ACCOUNT_SUSPENDED");

  const session = byId(tables, "sessions", args.p_session_id);
  if (!session) fail("SESSION_NOT_FOUND");
  const venue = byId(tables, "venues", session.venue_id)!;
  if (!isVenuePublic(tables, venue.id)) fail("SESSION_NOT_BOOKABLE");
  if (session.status !== "scheduled") fail("SESSION_CANCELLED");
  if (String(session.starts_at) <= now) fail("BOOKING_CLOSED");

  const membership = rowsWhere(
    tables,
    "memberships",
    (m) =>
      m.user_id === uid &&
      m.status === "active" &&
      String(m.starts_at) <= String(session.starts_at) &&
      String(session.ends_at) <= String(m.ends_at),
  ).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)))[0];
  if (!membership) {
    if (currentMembership(ctx, uid, now)) fail("MEMBERSHIP_EXPIRES_BEFORE_SESSION");
    fail("MEMBERSHIP_REQUIRED");
  }
  const pv = byId(tables, "plan_versions", membership.plan_version_id)!;
  if (!rowsWhere(tables, "plan_version_venues", (x) => x.plan_version_id === pv.id && x.venue_id === venue.id).length) {
    fail("PLAN_NOT_ELIGIBLE");
  }
  if (String(session.starts_at) > addDaysIso(now, Number(pv.booking_window_days))) fail("BOOKING_WINDOW_EXCEEDED");
  const live = (b: Row) => b.state === "confirmed" || b.state === "checked_in";
  if (rowsWhere(tables, "bookings", (b) => b.user_id === uid && b.session_id === session.id && live(b)).length) {
    fail("ALREADY_BOOKED");
  }
  if (
    rowsWhere(
      tables,
      "bookings",
      (b) =>
        b.user_id === uid &&
        live(b) &&
        String(b.session_starts_at) < String(session.ends_at) &&
        String(session.starts_at) < String(b.session_ends_at),
    ).length
  ) {
    fail("TIME_CONFLICT");
  }
  const localDate = localDateString(new Date(String(session.starts_at)), String(venue.timezone));
  const dayCount = rowsWhere(
    tables,
    "bookings",
    (b) =>
      b.membership_id === membership.id &&
      b.local_date === localDate &&
      ["confirmed", "checked_in", "cancelled_late", "no_show"].includes(String(b.state)),
  ).length;
  if (dayCount >= Number(pv.daily_visit_limit)) fail("DAILY_LIMIT_REACHED");
  const futureCount = rowsWhere(
    tables,
    "bookings",
    (b) => b.user_id === uid && b.state === "confirmed" && String(b.session_ends_at) > now,
  ).length;
  if (futureCount >= Number(pv.max_future_bookings)) fail("FUTURE_BOOKING_LIMIT_REACHED");
  const usage = membershipUsage(tables, membership.id);
  if (Number(pv.visit_allowance) - usage.consumed - usage.reserved <= 0) fail("VISIT_LIMIT_REACHED");
  if (Number(session.occupied_count) >= Number(session.capacity)) fail("SESSION_FULL");

  const startsAt = String(session.starts_at);
  const booking = insertBooking(tables, {
    user_id: uid,
    session_id: session.id,
    membership_id: membership.id,
    venue_id: venue.id,
    state: "confirmed",
    local_date: localDate,
    session_starts_at: startsAt,
    session_ends_at: String(session.ends_at),
    cancellation_deadline: addMinutes(startsAt, -Number(pv.free_cancellation_minutes)),
    checkin_opens_at: addMinutes(startsAt, -Number(pv.checkin_opens_minutes)),
    checkin_closes_at: minIso(addMinutes(startsAt, Number(pv.checkin_closes_minutes)), String(session.ends_at)),
    policy_snapshot: {
      plan_version_id: String(pv.id),
      free_cancellation_minutes: Number(pv.free_cancellation_minutes),
      checkin_opens_minutes: Number(pv.checkin_opens_minutes),
      checkin_closes_minutes: Number(pv.checkin_closes_minutes),
      daily_visit_limit: Number(pv.daily_visit_limit),
      max_future_bookings: Number(pv.max_future_bookings),
      timezone: String(venue.timezone),
    },
    idempotency_key: args.p_idempotency_key,
  });
  notify(tables, uid, "booking_confirmed", bookingNoticeParams(tables, booking.id));
  audit(tables, actor, "member", "booking.create", "booking", String(booking.id), null, null, null, {
    session_id: String(session.id),
    state: "confirmed",
    membership_id: String(membership.id),
  });
  return [{ booking_id: String(booking.id), booking_state: booking.state, replayed: false }];
}

export function cancel_booking({ tables, actor }: RpcContext, args: Args) {
  const uid = requireUid(actor);
  const now = nowIso();
  const booking = byId(tables, "bookings", args.p_booking_id);
  if (!booking || booking.user_id !== uid) fail("BOOKING_NOT_FOUND");
  lockMember(tables, uid);
  if (booking.state === "cancelled_on_time" || booking.state === "cancelled_late") {
    return [{ booking_id: String(booking.id), booking_state: booking.state, already_cancelled: true }];
  }
  if (booking.state === "checked_in") fail("ALREADY_CHECKED_IN");
  if (booking.state !== "confirmed") fail("BOOKING_NOT_CANCELLABLE");
  if (now >= String(booking.session_starts_at)) fail("CANCELLATION_CLOSED");
  let newState: string;
  if (now <= String(booking.cancellation_deadline)) {
    newState = "cancelled_on_time";
  } else {
    if (!args.p_accept_late) fail("LATE_CANCELLATION_UNCONFIRMED");
    newState = "cancelled_late";
  }
  const previous = String(booking.state);
  setBookingState(tables, booking, newState, { cancelled_at: now, cancelled_by: uid, cancellation_source: "member" });
  revokeOpenTokens(tables, booking.id, now);
  notify(
    tables,
    uid,
    newState === "cancelled_on_time" ? "booking_cancelled" : "booking_cancelled_late",
    bookingNoticeParams(tables, booking.id),
  );
  audit(
    tables,
    actor,
    "member",
    "booking.cancel",
    "booking",
    String(booking.id),
    null,
    { state: previous },
    { state: newState },
  );
  return [{ booking_id: String(booking.id), booking_state: newState, already_cancelled: false }];
}

export function issue_checkin_token({ tables, actor, store }: RpcContext, args: Args) {
  const uid = requireUid(actor);
  const now = nowIso();
  if (!consumeRateLimit(store, `checkin_issue:${uid}`, 100, 3600)) fail("RATE_LIMITED");
  const booking = byId(tables, "bookings", args.p_booking_id);
  if (!booking || booking.user_id !== uid) fail("BOOKING_NOT_FOUND");
  if (lockMember(tables, uid) !== "active") fail("ACCOUNT_SUSPENDED");
  if (booking.state === "checked_in") fail("ALREADY_CHECKED_IN");
  if (booking.state !== "confirmed") fail("BOOKING_NOT_ACTIVE");
  if (now < String(booking.checkin_opens_at) || now >= String(booking.checkin_closes_at))
    fail("OUTSIDE_CHECKIN_WINDOW");
  if (!isVenuePublic(tables, booking.venue_id)) fail("SESSION_NOT_BOOKABLE");
  const membership = byId(tables, "memberships", booking.membership_id);
  if (!membership || membership.status !== "active" || String(membership.ends_at) < String(booking.session_ends_at)) {
    fail("MEMBERSHIP_REQUIRED");
  }
  revokeOpenTokens(tables, booking.id, now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = addMinutes(now, 1);
  insertRow(tables, "checkin_tokens", {
    booking_id: booking.id,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    used_at: null,
    used_by: null,
    revoked_at: null,
  });
  return [{ token, expires_at: expiresAt }];
}

export function create_order({ tables, actor, store }: RpcContext, args: Args) {
  const uid = requireUid(actor);
  const now = nowIso();
  if (!args.p_plan_version_id || !args.p_provider) fail("VALIDATION_FAILED");
  if (!consumeRateLimit(store, `checkout:${uid}`, 10, 3600)) fail("RATE_LIMITED");
  if (lockMember(tables, uid) !== "active") fail("ACCOUNT_SUSPENDED");
  const pv = byId(tables, "plan_versions", args.p_plan_version_id);
  const plan = pv ? byId(tables, "plans", pv.plan_id) : undefined;
  if (!pv || pv.status !== "published" || !plan?.is_active) fail("PLAN_NOT_AVAILABLE");
  if (args.p_provider === "demo" && !DEMO_PAYMENTS_ENABLED) fail("PAYMENT_UNAVAILABLE");
  if (
    rowsWhere(tables, "memberships", (m) => m.user_id === uid && m.status === "active" && String(m.ends_at) > now)
      .length
  ) {
    fail("MEMBERSHIP_ALREADY_ACTIVE");
  }
  for (const open of rowsWhere(tables, "orders", (o) => o.user_id === uid && o.status === "pending")) {
    Object.assign(open, { status: "cancelled", cancelled_at: now, updated_at: now });
  }
  const order = insertRow(tables, "orders", {
    user_id: uid,
    plan_version_id: pv.id,
    amount_minor: Number(pv.price_minor),
    currency: String(pv.currency),
    provider: args.p_provider,
    is_demo: args.p_provider === "demo",
    status: "pending",
    needs_reconciliation: false,
    reconciliation_note: null,
    expires_at: addMinutes(now, 30),
    paid_at: null,
    failed_at: null,
    cancelled_at: null,
    refunded_at: null,
    refund_reference: null,
  });
  audit(tables, actor, "member", "order.create", "order", String(order.id), null, null, null, {
    plan_version_id: String(pv.id),
    amount_minor: Number(order.amount_minor),
    currency: String(order.currency),
    provider: String(order.provider),
  });
  return [
    {
      order_id: String(order.id),
      amount_minor: Number(order.amount_minor),
      currency: String(order.currency),
      expires_at: String(order.expires_at),
      is_demo: Boolean(order.is_demo),
    },
  ];
}

export function mark_notifications_read({ tables, actor }: RpcContext, args: Args) {
  const uid = requireUid(actor);
  const ids = Array.isArray(args.p_ids) ? new Set(args.p_ids.map(String)) : null;
  const now = nowIso();
  let count = 0;
  for (const n of rowsWhere(tables, "notifications", (n) => n.user_id === uid && n.read_at === null)) {
    if (ids && !ids.has(String(n.id))) continue;
    n.read_at = now;
    count++;
  }
  return count;
}
