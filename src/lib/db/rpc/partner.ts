/**
 * Partner functions. Every function re-checks organization-scoped authorization; staff of one
 * organization can never act on another organization's venues.
 */
import { localDayRange, zonedTimeToUtc } from "@/lib/time";
import {
  addDaysIso,
  addMinutes,
  audit,
  bookingNoticeParams,
  byId,
  hasOrgRole,
  hasVenueRole,
  insertRow,
  isAccountActive,
  isLocalizedText,
  isPlatformAdmin,
  isVenuePublic,
  lockMember,
  newId,
  notify,
  nowIso,
  requireStaffAccount,
  rowsWhere,
  setBookingState,
  touch,
  validateVenueContent,
  venueCancelSessions,
  venueSearchText,
} from "../core";
import type { Json } from "../database.types";
import { fail } from "../errors";
import { consumeRateLimit } from "../store";
import type { Args, RpcContext } from "./context";
import { hashToken } from "./member";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function partner_create_venue({ tables, actor }: RpcContext, args: Args) {
  const uid = requireStaffAccount(tables, actor);
  if (!hasOrgRole(tables, actor, args.p_organization_id, ["manager"])) fail("FORBIDDEN");
  const slug = String(args.p_slug ?? "");
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 80) fail("INVALID_CONTENT", "slug");
  if (rowsWhere(tables, "venues", (v) => v.slug === slug).length) fail("SLUG_TAKEN");
  const id = newId();
  const content = validateVenueContent(tables, id, args.p_content);
  insertRow(tables, "venues", {
    id,
    organization_id: args.p_organization_id,
    slug,
    name: content.name,
    description: content.description,
    address: content.address,
    rules: content.rules,
    district_id: content.district_id,
    latitude: content.latitude,
    longitude: content.longitude,
    timezone: "Asia/Tashkent",
    contact_phone: content.contact_phone,
    publication_status: "draft",
    operational_status: "active",
    status_reason: null,
    is_demo: false,
    search_text: venueSearchText(content.name),
    published_at: null,
  });
  insertRow(tables, "venue_revisions", {
    venue_id: id,
    status: "draft",
    content,
    created_by: uid,
    submitted_at: null,
    submitted_by: null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  });
  audit(tables, actor, "staff", "venue.create", "venue", id, null, null, null, {
    organization_id: String(args.p_organization_id),
    slug,
  });
  return id;
}

export function partner_save_venue_revision({ tables, actor }: RpcContext, args: Args) {
  const uid = requireStaffAccount(tables, actor);
  if (!hasVenueRole(tables, actor, args.p_venue_id, ["manager"])) fail("FORBIDDEN");
  const content = validateVenueContent(tables, String(args.p_venue_id), args.p_content);
  const open = rowsWhere(
    tables,
    "venue_revisions",
    (r) => r.venue_id === args.p_venue_id && (r.status === "draft" || r.status === "submitted"),
  )[0];
  if (open) {
    if (open.status === "submitted") fail("REVISION_LOCKED");
    open.content = content;
    touch("venue_revisions", open);
    return String(open.id);
  }
  const created = insertRow(tables, "venue_revisions", {
    venue_id: args.p_venue_id,
    status: "draft",
    content,
    created_by: uid,
    submitted_at: null,
    submitted_by: null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  });
  return String(created.id);
}

export function partner_submit_venue_revision({ tables, actor }: RpcContext, args: Args) {
  const uid = requireStaffAccount(tables, actor);
  if (!hasVenueRole(tables, actor, args.p_venue_id, ["manager"])) fail("FORBIDDEN");
  const draft = rowsWhere(tables, "venue_revisions", (r) => r.venue_id === args.p_venue_id && r.status === "draft")[0];
  if (!draft) fail("REVISION_NOT_FOUND");
  validateVenueContent(tables, String(args.p_venue_id), draft.content);
  Object.assign(draft, { status: "submitted", submitted_at: nowIso(), submitted_by: uid });
  touch("venue_revisions", draft);
  audit(tables, actor, "staff", "venue_revision.submit", "venue_revision", String(draft.id), null, null, null, {
    venue_id: String(args.p_venue_id),
  });
  return String(draft.id);
}

export function partner_withdraw_venue_revision({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  if (!hasVenueRole(tables, actor, args.p_venue_id, ["manager"])) fail("FORBIDDEN");
  const submitted = rowsWhere(
    tables,
    "venue_revisions",
    (r) => r.venue_id === args.p_venue_id && r.status === "submitted",
  )[0];
  if (!submitted) fail("REVISION_NOT_FOUND");
  Object.assign(submitted, { status: "draft", submitted_at: null, submitted_by: null });
  touch("venue_revisions", submitted);
  audit(tables, actor, "staff", "venue_revision.withdraw", "venue_revision", String(submitted.id));
  return String(submitted.id);
}

function validActivity(args: Args): boolean {
  return (
    isLocalizedText(args.p_title, 120) &&
    isLocalizedText(args.p_description ?? { uz: "" }, 2000, false) &&
    typeof args.p_duration_minutes === "number" &&
    args.p_duration_minutes >= 15 &&
    args.p_duration_minutes <= 480 &&
    typeof args.p_default_capacity === "number" &&
    args.p_default_capacity >= 1 &&
    args.p_default_capacity <= 500
  );
}

export function partner_create_activity({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  if (!hasVenueRole(tables, actor, args.p_venue_id, ["manager"])) fail("FORBIDDEN");
  if (!validActivity(args) || !args.p_kind || !byId(tables, "categories", args.p_category_id))
    fail("VALIDATION_FAILED");
  const activity = insertRow(tables, "activities", {
    venue_id: args.p_venue_id,
    category_id: args.p_category_id,
    kind: args.p_kind,
    title: args.p_title,
    description: args.p_description ?? { uz: "" },
    duration_minutes: args.p_duration_minutes,
    default_capacity: args.p_default_capacity,
    is_active: true,
  });
  audit(tables, actor, "staff", "activity.create", "activity", String(activity.id), null, null, null, {
    venue_id: String(args.p_venue_id),
    kind: String(args.p_kind),
  });
  return String(activity.id);
}

export function partner_update_activity({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  const activity = byId(tables, "activities", args.p_activity_id);
  if (!activity || !hasVenueRole(tables, actor, activity.venue_id, ["manager"])) fail("FORBIDDEN");
  if (!validActivity(args) || typeof args.p_is_active !== "boolean") fail("VALIDATION_FAILED");
  const before = { ...activity };
  delete before.created_at;
  delete before.updated_at;
  Object.assign(activity, {
    title: args.p_title,
    description: args.p_description ?? { uz: "" },
    duration_minutes: args.p_duration_minutes,
    default_capacity: args.p_default_capacity,
    is_active: args.p_is_active,
  });
  touch("activities", activity);
  audit(tables, actor, "staff", "activity.update", "activity", String(activity.id), null, before as Json, {
    duration_minutes: Number(args.p_duration_minutes),
    default_capacity: Number(args.p_default_capacity),
    is_active: Boolean(args.p_is_active),
  });
  return undefined;
}

export function partner_create_sessions({ tables, actor }: RpcContext, args: Args) {
  const uid = requireStaffAccount(tables, actor);
  const now = nowIso();
  const activity = byId(tables, "activities", args.p_activity_id);
  if (!activity || !hasVenueRole(tables, actor, activity.venue_id, ["manager"])) fail("FORBIDDEN");
  if (!activity.is_active) fail("ACTIVITY_INACTIVE");
  const starts = Array.isArray(args.p_local_starts) ? args.p_local_starts.map(String) : [];
  if (starts.length < 1 || starts.length > 60) fail("VALIDATION_FAILED", "between 1 and 60 start times");
  const capacity = typeof args.p_capacity === "number" ? args.p_capacity : Number(activity.default_capacity);
  if (capacity < 1 || capacity > 500) fail("VALIDATION_FAILED", "capacity");
  const venue = byId(tables, "venues", activity.venue_id)!;
  const created: string[] = [];
  for (const local of starts) {
    const date = local.slice(0, 10);
    const time = local.slice(11, 16);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail("VALIDATION_FAILED", "start time");
    const startsAt = zonedTimeToUtc(date, time, String(venue.timezone)).toISOString();
    if (startsAt <= now) fail("SESSION_IN_PAST");
    if (startsAt > addDaysIso(now, 90)) fail("VALIDATION_FAILED", "sessions can be scheduled up to 90 days ahead");
    if (
      rowsWhere(
        tables,
        "sessions",
        (s) => s.activity_id === activity.id && s.starts_at === startsAt && s.status === "scheduled",
      ).length
    ) {
      fail("SESSION_DUPLICATE");
    }
    const session = insertRow(tables, "sessions", {
      venue_id: venue.id,
      activity_id: activity.id,
      starts_at: startsAt,
      ends_at: addMinutes(startsAt, Number(activity.duration_minutes)),
      capacity,
      occupied_count: 0,
      status: "scheduled",
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
      created_by: uid,
    });
    created.push(String(session.id));
  }
  audit(tables, actor, "staff", "session.create", "activity", String(activity.id), null, null, null, {
    session_ids: created,
    capacity,
  });
  return created;
}

export function partner_update_session_capacity({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  const session = byId(tables, "sessions", args.p_session_id);
  if (!session || !hasVenueRole(tables, actor, session.venue_id, ["manager"])) fail("FORBIDDEN");
  const capacity = args.p_capacity;
  if (typeof capacity !== "number" || capacity < 1 || capacity > 500) fail("VALIDATION_FAILED");
  if (session.status !== "scheduled") fail("SESSION_CANCELLED");
  if (String(session.ends_at) <= nowIso()) fail("SESSION_ENDED");
  if (capacity < Number(session.occupied_count)) fail("CAPACITY_BELOW_OCCUPIED");
  const before = Number(session.capacity);
  session.capacity = capacity;
  touch("sessions", session);
  audit(
    tables,
    actor,
    "staff",
    "session.capacity",
    "session",
    String(session.id),
    null,
    { capacity: before },
    { capacity },
  );
  return undefined;
}

export function cancel_session({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  const session = byId(tables, "sessions", args.p_session_id);
  if (!session) fail("SESSION_NOT_FOUND");
  let role: "staff" | "admin";
  if (hasVenueRole(tables, actor, session.venue_id, ["manager"])) role = "staff";
  else if (isPlatformAdmin(tables, actor)) role = "admin";
  else fail("FORBIDDEN");
  const reason = typeof args.p_reason === "string" ? args.p_reason : "";
  if (reason.trim().length < 3 || reason.length > 500) fail("REASON_REQUIRED");
  if (session.status === "cancelled") return 0;
  if (String(session.ends_at) <= nowIso()) fail("SESSION_ENDED");
  return venueCancelSessions(tables, actor, [String(session.id)], reason.trim(), role, "venue");
}

function displayName(tables: RpcContext["tables"], userId: unknown): string {
  const profile = byId(tables, "profiles", userId);
  return profile && profile.anonymized_at === null ? String(profile.display_name ?? "") : "";
}

export function get_session_roster({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  const session = byId(tables, "sessions", args.p_session_id);
  if (!session || !(hasVenueRole(tables, actor, session.venue_id, null) || isPlatformAdmin(tables, actor)))
    fail("FORBIDDEN");
  return rowsWhere(tables, "bookings", (b) => b.session_id === session.id && b.state !== "cancelled_on_time")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((b) => ({
      booking_id: String(b.id),
      member_display_name: displayName(tables, b.user_id),
      booking_state: b.state,
      booked_at: String(b.created_at),
      checked_in_at: (b.checked_in_at as string | null) ?? null,
    }));
}

export function partner_day_sessions({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  if (!(hasVenueRole(tables, actor, args.p_venue_id, null) || isPlatformAdmin(tables, actor))) fail("FORBIDDEN");
  const venue = byId(tables, "venues", args.p_venue_id);
  if (!venue) return [];
  const { start, end } = localDayRange(String(args.p_date), String(venue.timezone));
  return rowsWhere(
    tables,
    "sessions",
    (s) =>
      s.venue_id === venue.id && String(s.starts_at) >= start.toISOString() && String(s.starts_at) < end.toISOString(),
  )
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)) || String(a.id).localeCompare(String(b.id)))
    .map((s) => {
      const activity = byId(tables, "activities", s.activity_id)!;
      const bookings = rowsWhere(tables, "bookings", (b) => b.session_id === s.id);
      const count = (state: string) => bookings.filter((b) => b.state === state).length;
      return {
        session_id: String(s.id),
        activity_id: String(activity.id),
        activity_title: activity.title as Json,
        activity_kind: activity.kind,
        starts_at: String(s.starts_at),
        ends_at: String(s.ends_at),
        capacity: Number(s.capacity),
        status: s.status,
        cancellation_reason: (s.cancellation_reason as string | null) ?? null,
        confirmed_count: count("confirmed"),
        checked_in_count: count("checked_in"),
        no_show_count: count("no_show"),
        late_cancel_count: count("cancelled_late"),
      };
    });
}

export function partner_attendance_report({ tables, actor }: RpcContext, args: Args) {
  requireStaffAccount(tables, actor);
  if (!(hasVenueRole(tables, actor, args.p_venue_id, ["manager"]) || isPlatformAdmin(tables, actor))) fail("FORBIDDEN");
  const from = String(args.p_from ?? "");
  const to = String(args.p_to ?? "");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!from || !to || Number.isNaN(days) || days < 0 || days > 92)
    fail("VALIDATION_FAILED", "date range up to 93 days");
  return rowsWhere(
    tables,
    "bookings",
    (b) =>
      b.venue_id === args.p_venue_id &&
      String(b.local_date) >= from &&
      String(b.local_date) <= to &&
      ["confirmed", "checked_in", "no_show", "cancelled_late", "venue_cancelled"].includes(String(b.state)),
  )
    .sort(
      (a, b) =>
        String(a.session_starts_at).localeCompare(String(b.session_starts_at)) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )
    .map((b) => {
      const session = byId(tables, "sessions", b.session_id);
      const activity = session ? byId(tables, "activities", session.activity_id) : undefined;
      return {
        local_date: String(b.local_date),
        session_starts_at: String(b.session_starts_at),
        activity_title: (activity?.title ?? null) as Json,
        booking_id: String(b.id),
        member_display_name: displayName(tables, b.user_id),
        booking_state: b.state,
        checked_in_at: (b.checked_in_at as string | null) ?? null,
      };
    });
}

type RedeemRow = {
  ok: boolean;
  error_code: string | null;
  booking_id: string | null;
  member_display_name: string | null;
  activity_title: Json | null;
  session_starts_at: string | null;
  checked_in_at: string | null;
};

const refuse = (code: string): RedeemRow[] => [
  {
    ok: false,
    error_code: code,
    booking_id: null,
    member_display_name: null,
    activity_title: null,
    session_starts_at: null,
    checked_in_at: null,
  },
];

/** QR redemption. Business failures are returned, not raised, so failed attempts count toward the limit. */
export function redeem_checkin_token({ tables, actor, store }: RpcContext, args: Args): RedeemRow[] {
  const uid = actor.uid;
  if (!uid) return refuse("AUTH_REQUIRED");
  if (!consumeRateLimit(store, `checkin_redeem:${uid}`, 120, 60)) return refuse("RATE_LIMITED");
  if (!args.p_venue_id || !hasVenueRole(tables, actor, args.p_venue_id, null)) return refuse("FORBIDDEN");
  let raw = String(args.p_token ?? "").trim();
  if (raw.startsWith("UZFIT1:")) raw = raw.slice(7);
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return refuse("TOKEN_INVALID");
  const hash = hashToken(raw);
  const token = rowsWhere(tables, "checkin_tokens", (t) => t.token_hash === hash)[0];
  const booking = token ? byId(tables, "bookings", token.booking_id) : undefined;
  if (!token || !booking) return refuse("TOKEN_INVALID");
  if (booking.venue_id !== args.p_venue_id) return refuse("WRONG_VENUE");
  const now = nowIso();
  const member = String(booking.user_id);
  lockMember(tables, member);
  if (token.used_at !== null) return refuse("TOKEN_ALREADY_USED");
  if (token.revoked_at !== null) return refuse("TOKEN_INVALID");
  if (String(token.expires_at) <= now) return refuse("TOKEN_EXPIRED");
  if (booking.state === "checked_in") return refuse("ALREADY_CHECKED_IN");
  if (booking.state !== "confirmed") return refuse("BOOKING_NOT_ACTIVE");
  if (now < String(booking.checkin_opens_at) || now >= String(booking.checkin_closes_at))
    return refuse("OUTSIDE_CHECKIN_WINDOW");
  if (!isVenuePublic(tables, args.p_venue_id)) return refuse("SESSION_NOT_BOOKABLE");
  const membership = byId(tables, "memberships", booking.membership_id);
  if (!membership || membership.status !== "active" || String(membership.ends_at) < String(booking.session_ends_at)) {
    return refuse("MEMBERSHIP_REQUIRED");
  }
  if (!isAccountActive(tables, member)) return refuse("ACCOUNT_SUSPENDED");

  Object.assign(token, { used_at: now, used_by: uid });
  setBookingState(tables, booking, "checked_in", { checked_in_at: now });
  insertRow(tables, "checkins", {
    booking_id: booking.id,
    venue_id: args.p_venue_id,
    checked_in_at: now,
    verified_by: uid,
    token_id: token.id,
  });
  const session = byId(tables, "sessions", booking.session_id);
  const activity = session ? byId(tables, "activities", session.activity_id) : undefined;
  notify(tables, member, "checkin_completed", bookingNoticeParams(tables, booking.id));
  audit(
    tables,
    actor,
    "staff",
    "booking.check_in",
    "booking",
    String(booking.id),
    null,
    { state: "confirmed" },
    { state: "checked_in" },
    { venue_id: String(args.p_venue_id) },
  );
  return [
    {
      ok: true,
      error_code: null,
      booking_id: String(booking.id),
      member_display_name: displayName(tables, member),
      activity_title: (activity?.title ?? null) as Json,
      session_starts_at: String(booking.session_starts_at),
      checked_in_at: now,
    },
  ];
}
