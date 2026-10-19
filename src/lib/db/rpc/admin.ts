/**
 * Platform-admin functions. Every operation requires the admin role on an active account,
 * requires a reason where it changes a member's entitlement or visibility, and writes an audit
 * entry.
 */
import {
  addDaysIso,
  audit,
  byId,
  deleteWhere,
  insertRow,
  lockMember,
  notify,
  nowIso,
  requireAdmin,
  requireReason,
  revokeMembershipCore,
  rowsWhere,
  setBookingState,
  touch,
  validateVenueContent,
  venueCancelSessions,
  venueSearchText,
} from "../core";
import type { Json } from "../database.types";
import { fail } from "../errors";
import type { Row } from "../query";
import type { Args, RpcContext } from "./context";

export function admin_set_venue_status({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const venue = byId(tables, "venues", args.p_venue_id);
  if (!venue) fail("VENUE_NOT_FOUND");
  const before = {
    publication_status: String(venue.publication_status),
    operational_status: String(venue.operational_status),
  };
  let reason: string | null = null;
  switch (args.p_action) {
    case "publish":
      if (venue.publication_status !== "unpublished") fail("INVALID_TRANSITION");
      Object.assign(venue, { publication_status: "published", published_at: nowIso(), status_reason: null });
      break;
    case "unpublish":
      reason = requireReason(args.p_reason);
      if (venue.publication_status !== "published") fail("INVALID_TRANSITION");
      Object.assign(venue, { publication_status: "unpublished", status_reason: reason });
      break;
    case "suspend":
      reason = requireReason(args.p_reason);
      if (venue.operational_status === "suspended") fail("INVALID_TRANSITION");
      Object.assign(venue, { operational_status: "suspended", status_reason: reason });
      break;
    case "reinstate":
      if (venue.operational_status !== "suspended") fail("INVALID_TRANSITION");
      Object.assign(venue, { operational_status: "active", status_reason: null });
      break;
    default:
      fail("VALIDATION_FAILED", "unknown action");
  }
  touch("venues", venue);
  let released = 0;
  if (args.p_cancel_future_sessions === true && (args.p_action === "unpublish" || args.p_action === "suspend")) {
    const now = nowIso();
    const sessions = rowsWhere(
      tables,
      "sessions",
      (s) => s.venue_id === venue.id && s.status === "scheduled" && String(s.ends_at) > now,
    );
    if (sessions.length) {
      released = venueCancelSessions(
        tables,
        actor,
        sessions.map((s) => String(s.id)),
        reason ?? "",
        "admin",
        "admin",
      );
    }
  }
  audit(tables, actor, "admin", `venue.${args.p_action}`, "venue", String(venue.id), reason, before, null, {
    released_bookings: released,
  });
  return released;
}

export function admin_review_venue_revision({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  const revision = byId(tables, "venue_revisions", args.p_revision_id);
  if (!revision) fail("REVISION_NOT_FOUND");
  if (revision.status !== "submitted") fail("REVISION_NOT_SUBMITTED");
  const note = typeof args.p_note === "string" && args.p_note !== "" ? args.p_note : null;
  if (args.p_approve !== true) {
    Object.assign(revision, {
      status: "rejected",
      reviewed_at: nowIso(),
      reviewed_by: uid,
      review_note: requireReason(note),
    });
    touch("venue_revisions", revision);
    audit(tables, actor, "admin", "venue_revision.reject", "venue_revision", String(revision.id), note);
    return undefined;
  }
  const venue = byId(tables, "venues", revision.venue_id);
  if (!venue) fail("VENUE_NOT_FOUND");
  const content = validateVenueContent(tables, String(venue.id), revision.content);
  const wasDraft = venue.publication_status === "draft";
  Object.assign(venue, {
    name: content.name,
    description: content.description,
    address: content.address,
    rules: content.rules,
    district_id: content.district_id,
    latitude: content.latitude,
    longitude: content.longitude,
    contact_phone: content.contact_phone,
    search_text: venueSearchText(content.name),
    publication_status: wasDraft ? "published" : venue.publication_status,
    published_at: wasDraft ? nowIso() : venue.published_at,
  });
  touch("venues", venue);
  deleteWhere(tables, "venue_categories", (x) => x.venue_id === venue.id);
  for (const id of content.category_ids as string[])
    insertRow(tables, "venue_categories", { venue_id: venue.id, category_id: id });
  deleteWhere(tables, "venue_amenities", (x) => x.venue_id === venue.id);
  for (const id of content.amenity_ids as string[])
    insertRow(tables, "venue_amenities", { venue_id: venue.id, amenity_id: id });
  deleteWhere(tables, "venue_images", (x) => x.venue_id === venue.id);
  (content.images as Array<{ path: string; alt?: Json }>).forEach((image, index) =>
    insertRow(tables, "venue_images", {
      venue_id: venue.id,
      storage_path: image.path,
      alt: image.alt ?? { uz: "" },
      sort_order: index,
    }),
  );
  deleteWhere(tables, "venue_opening_hours", (x) => x.venue_id === venue.id);
  for (const day of content.opening_hours as Array<{
    weekday: number;
    is_closed?: boolean;
    opens_at?: string;
    closes_at?: string;
  }>) {
    insertRow(tables, "venue_opening_hours", {
      venue_id: venue.id,
      weekday: day.weekday,
      opens_at: day.is_closed ? null : (day.opens_at ?? null),
      closes_at: day.is_closed ? null : (day.closes_at ?? null),
      is_closed: Boolean(day.is_closed),
    });
  }
  Object.assign(revision, { status: "approved", reviewed_at: nowIso(), reviewed_by: uid, review_note: note });
  touch("venue_revisions", revision);
  audit(
    tables,
    actor,
    "admin",
    "venue_revision.approve",
    "venue_revision",
    String(revision.id),
    note,
    { venue_id: String(venue.id), publication_status: wasDraft ? "draft" : String(venue.publication_status) },
    content,
  );
  return undefined;
}

export function admin_create_organization({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const name = typeof args.p_name === "string" ? args.p_name.trim() : "";
  if (name.length < 2 || name.length > 120) fail("VALIDATION_FAILED");
  const org = insertRow(tables, "organizations", {
    name,
    status: "active",
    status_reason: null,
    is_demo: Boolean(args.p_is_demo),
  });
  audit(tables, actor, "admin", "organization.create", "organization", String(org.id), null, null, { name });
  return String(org.id);
}

export function admin_set_organization_status({ tables, actor }: RpcContext, args: Args) {
  const reason = requireReason(args.p_reason);
  requireAdmin(tables, actor);
  const org = byId(tables, "organizations", args.p_organization_id);
  if (!org) fail("ORGANIZATION_NOT_FOUND");
  const before = String(org.status);
  Object.assign(org, { status: args.p_status, status_reason: args.p_status === "active" ? null : reason });
  touch("organizations", org);
  audit(
    tables,
    actor,
    "admin",
    "organization.status",
    "organization",
    String(org.id),
    reason,
    { status: before },
    {
      status: String(args.p_status),
    },
  );
  return undefined;
}

export function admin_set_org_member({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  if (!byId(tables, "organizations", args.p_organization_id)) fail("ORGANIZATION_NOT_FOUND");
  const profile = byId(tables, "profiles", args.p_user_id);
  if (!profile || profile.anonymized_at !== null) fail("USER_NOT_FOUND");
  if (!args.p_role) fail("VALIDATION_FAILED");
  const existing = rowsWhere(
    tables,
    "organization_members",
    (m) => m.organization_id === args.p_organization_id && m.user_id === args.p_user_id,
  )[0];
  const before = existing ? String(existing.role) : null;
  if (existing) existing.role = args.p_role;
  else {
    insertRow(tables, "organization_members", {
      organization_id: args.p_organization_id,
      user_id: args.p_user_id,
      role: args.p_role,
      created_by: uid,
    });
  }
  audit(
    tables,
    actor,
    "admin",
    "organization.member_set",
    "organization",
    String(args.p_organization_id),
    null,
    before ? { user_id: String(args.p_user_id), role: before } : null,
    { user_id: String(args.p_user_id), role: String(args.p_role) },
  );
  return undefined;
}

export function admin_remove_org_member({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const existing = rowsWhere(
    tables,
    "organization_members",
    (m) => m.organization_id === args.p_organization_id && m.user_id === args.p_user_id,
  )[0];
  if (!existing) fail("NOT_FOUND");
  deleteWhere(tables, "organization_members", (m) => m === existing);
  audit(tables, actor, "admin", "organization.member_remove", "organization", String(args.p_organization_id), null, {
    user_id: String(args.p_user_id),
    role: String(existing.role),
  });
  return undefined;
}

function currentPlan(tables: RpcContext["tables"], userId: unknown, now: string) {
  const m = rowsWhere(
    tables,
    "memberships",
    (m) => m.user_id === userId && m.status === "active" && String(m.starts_at) <= now && now < String(m.ends_at),
  ).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)))[0];
  if (!m) return { code: null, ends_at: null };
  const pv = byId(tables, "plan_versions", m.plan_version_id);
  const plan = pv ? byId(tables, "plans", pv.plan_id) : undefined;
  return { code: plan ? String(plan.code) : null, ends_at: String(m.ends_at) };
}

export function admin_find_users({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const q = String(args.p_query ?? "")
    .trim()
    .slice(0, 120)
    .toLowerCase();
  const now = nowIso();
  return rowsWhere(tables, "auth_users", (u) => u.deleted_at === null)
    .filter((u) => {
      if (!q) return true;
      const profile = byId(tables, "profiles", u.id);
      return (
        String(u.email).toLowerCase().includes(q) ||
        String(profile?.display_name ?? "")
          .toLowerCase()
          .includes(q)
      );
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 25)
    .map((u) => {
      const profile = byId(tables, "profiles", u.id);
      const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === u.id)[0];
      const plan = currentPlan(tables, u.id, now);
      return {
        user_id: String(u.id),
        email: String(u.email),
        display_name: String(profile?.display_name ?? ""),
        created_at: String(u.created_at),
        email_confirmed_at: (u.email_confirmed_at as string | null) ?? null,
        account_status: status?.status ?? "active",
        is_admin: rowsWhere(tables, "platform_roles", (r) => r.user_id === u.id).length > 0,
        organization_count: rowsWhere(tables, "organization_members", (m) => m.user_id === u.id).length,
        current_plan_code: plan.code,
        current_membership_ends_at: plan.ends_at,
      };
    });
}

export function admin_user_summary({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const u = byId(tables, "auth_users", args.p_user_id);
  const profile = byId(tables, "profiles", args.p_user_id);
  if (!u || !profile) return [];
  const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === u.id)[0];
  return [
    {
      user_id: String(u.id),
      email: String(u.email),
      display_name: String(profile.display_name ?? ""),
      phone_e164: (profile.phone_e164 as string | null) ?? null,
      locale: profile.locale,
      created_at: String(u.created_at),
      email_confirmed_at: (u.email_confirmed_at as string | null) ?? null,
      last_sign_in_at: (u.last_sign_in_at as string | null) ?? null,
      account_status: status?.status ?? "active",
      status_reason: (status?.reason as string | null) ?? null,
      is_admin: rowsWhere(tables, "platform_roles", (r) => r.user_id === u.id).length > 0,
      anonymized_at: (profile.anonymized_at as string | null) ?? null,
    },
  ];
}

export function admin_set_account_status({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  const reason = requireReason(args.p_reason);
  if (args.p_user_id === uid && args.p_status === "suspended") fail("FORBIDDEN", "admins cannot suspend themselves");
  const before = lockMember(tables, String(args.p_user_id));
  const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === args.p_user_id)[0]!;
  Object.assign(status, { status: args.p_status, reason: args.p_status === "active" ? null : reason, updated_by: uid });
  touch("account_statuses", status);
  audit(
    tables,
    actor,
    "admin",
    "account.status",
    "user",
    String(args.p_user_id),
    reason,
    { status: before },
    {
      status: String(args.p_status),
    },
  );
  return undefined;
}

export function admin_anonymize_user({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  const reason = requireReason(args.p_reason);
  if (args.p_user_id === uid) fail("FORBIDDEN", "admins cannot anonymize themselves");
  lockMember(tables, String(args.p_user_id));
  const now = nowIso();
  for (const m of rowsWhere(
    tables,
    "memberships",
    (m) => m.user_id === args.p_user_id && m.status === "active" && String(m.ends_at) > now,
  )) {
    revokeMembershipCore(tables, actor, m.id, "account anonymized", "admin");
  }
  const profile = byId(tables, "profiles", args.p_user_id);
  if (profile) {
    Object.assign(profile, { display_name: "", phone_e164: null, anonymized_at: now });
    touch("profiles", profile);
  }
  const status = rowsWhere(tables, "account_statuses", (s) => s.user_id === args.p_user_id)[0];
  if (status) Object.assign(status, { status: "suspended", reason: "anonymized", updated_by: uid });
  deleteWhere(tables, "favorites", (f) => f.user_id === args.p_user_id);
  deleteWhere(tables, "notifications", (n) => n.user_id === args.p_user_id);
  deleteWhere(tables, "organization_members", (m) => m.user_id === args.p_user_id);
  deleteWhere(tables, "platform_roles", (r) => r.user_id === args.p_user_id);
  audit(tables, actor, "admin", "account.anonymize", "user", String(args.p_user_id), reason);
  return undefined;
}

export function admin_grant_membership({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  const reason = requireReason(args.p_reason);
  const now = nowIso();
  const pv = byId(tables, "plan_versions", args.p_plan_version_id);
  if (!pv || pv.status !== "published") fail("PLAN_NOT_AVAILABLE");
  const profile = byId(tables, "profiles", args.p_user_id);
  if (!profile || profile.anonymized_at !== null) fail("USER_NOT_FOUND");
  lockMember(tables, String(args.p_user_id));
  if (
    rowsWhere(
      tables,
      "memberships",
      (m) => m.user_id === args.p_user_id && m.status === "active" && String(m.ends_at) > now,
    ).length
  ) {
    fail("MEMBERSHIP_ALREADY_ACTIVE");
  }
  const membership = insertRow(tables, "memberships", {
    user_id: args.p_user_id,
    plan_version_id: pv.id,
    starts_at: now,
    ends_at: addDaysIso(now, Number(pv.duration_days)),
    status: "active",
    source: "admin",
    order_id: null,
    is_demo: Boolean(pv.is_demo),
    granted_by: uid,
    grant_reason: reason,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
  });
  notify(tables, String(args.p_user_id), "membership_granted", {
    membership_id: String(membership.id),
    plan_name: pv.name as Json,
  });
  audit(tables, actor, "admin", "membership.grant", "membership", String(membership.id), reason, null, {
    user_id: String(args.p_user_id),
    plan_version_id: String(pv.id),
  });
  return String(membership.id);
}

export function admin_revoke_membership({ tables, actor }: RpcContext, args: Args) {
  const reason = requireReason(args.p_reason);
  requireAdmin(tables, actor);
  return revokeMembershipCore(tables, actor, args.p_membership_id, reason, "admin");
}

export function admin_correct_booking({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  const reason = requireReason(args.p_reason);
  const now = nowIso();
  const booking = byId(tables, "bookings", args.p_booking_id);
  if (!booking) fail("BOOKING_NOT_FOUND");
  lockMember(tables, String(booking.user_id));
  const target = String(args.p_new_state);
  const allowed =
    (booking.state === "no_show" && (target === "checked_in" || target === "cancelled_on_time")) ||
    (booking.state === "cancelled_late" && target === "cancelled_on_time");
  if (!allowed) fail("INVALID_TRANSITION");
  const before = String(booking.state);
  if (target === "checked_in") {
    setBookingState(tables, booking, "checked_in", { checked_in_at: booking.session_starts_at });
    if (!rowsWhere(tables, "checkins", (c) => c.booking_id === booking.id).length) {
      insertRow(tables, "checkins", {
        booking_id: booking.id,
        venue_id: booking.venue_id,
        checked_in_at: booking.session_starts_at,
        verified_by: uid,
        token_id: null,
      });
    }
  } else {
    setBookingState(tables, booking, "cancelled_on_time", {
      cancelled_at: booking.cancelled_at ?? now,
      cancelled_by: uid,
      cancellation_source: "admin",
      cancellation_reason: reason,
    });
  }
  audit(
    tables,
    actor,
    "admin",
    "booking.correct",
    "booking",
    String(booking.id),
    reason,
    { state: before },
    { state: target },
  );
  return undefined;
}

export function admin_create_plan({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const code = String(args.p_code ?? "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code) || code.length > 40) fail("VALIDATION_FAILED");
  if (rowsWhere(tables, "plans", (p) => p.code === code).length) fail("PLAN_CODE_TAKEN");
  const plan = insertRow(tables, "plans", {
    code,
    sort_order: typeof args.p_sort_order === "number" ? args.p_sort_order : 0,
    is_active: true,
  });
  audit(tables, actor, "admin", "plan.create", "plan", String(plan.id), null, null, { code });
  return String(plan.id);
}

function intOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

export function admin_create_plan_version({ tables, actor }: RpcContext, args: Args) {
  const uid = requireAdmin(tables, actor);
  if (!byId(tables, "plans", args.p_plan_id)) fail("PLAN_NOT_FOUND");
  const terms = args.p_terms;
  if (typeof terms !== "object" || terms === null || Array.isArray(terms)) fail("VALIDATION_FAILED");
  const t = terms as Record<string, unknown>;
  const venueIds = Array.isArray(args.p_venue_ids) ? [...new Set(args.p_venue_ids.map(String))] : [];
  if (venueIds.length === 0 || !venueIds.every((id) => byId(tables, "venues", id)))
    fail("VALIDATION_FAILED", "venue_ids");
  const price = t.price_minor;
  const duration = t.duration_days;
  const allowance = t.visit_allowance;
  if (
    typeof price !== "number" ||
    price < 0 ||
    typeof duration !== "number" ||
    duration < 1 ||
    duration > 366 ||
    typeof allowance !== "number" ||
    allowance < 1 ||
    allowance > 1000 ||
    typeof t.name !== "object"
  ) {
    fail("VALIDATION_FAILED", "plan terms");
  }
  const version =
    Math.max(
      0,
      ...rowsWhere(tables, "plan_versions", (pv) => pv.plan_id === args.p_plan_id).map((pv) => Number(pv.version)),
    ) + 1;
  const pv = insertRow(tables, "plan_versions", {
    plan_id: args.p_plan_id,
    version,
    status: "draft",
    name: t.name,
    description: t.description ?? { uz: "" },
    price_minor: price,
    currency: "UZS",
    duration_days: duration,
    visit_allowance: allowance,
    daily_visit_limit: intOr(t.daily_visit_limit, 1),
    max_future_bookings: intOr(t.max_future_bookings, 3),
    booking_window_days: intOr(t.booking_window_days, 7),
    free_cancellation_minutes: intOr(t.free_cancellation_minutes, 120),
    checkin_opens_minutes: intOr(t.checkin_opens_minutes, 15),
    checkin_closes_minutes: intOr(t.checkin_closes_minutes, 30),
    is_demo: Boolean(t.is_demo),
    published_at: null,
    retired_at: null,
    created_by: uid,
  });
  for (const venueId of venueIds)
    insertRow(tables, "plan_version_venues", { plan_version_id: pv.id, venue_id: venueId });
  audit(tables, actor, "admin", "plan_version.create", "plan_version", String(pv.id), null, null, {
    ...(terms as Record<string, Json>),
    version,
    venue_count: venueIds.length,
  });
  return String(pv.id);
}

export function admin_delete_plan_version_draft({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const pv = byId(tables, "plan_versions", args.p_plan_version_id);
  if (!pv || pv.status !== "draft") fail("PLAN_VERSION_IMMUTABLE");
  deleteWhere(tables, "plan_version_venues", (x) => x.plan_version_id === pv.id);
  deleteWhere(tables, "plan_versions", (x) => x.id === pv.id);
  audit(tables, actor, "admin", "plan_version.delete_draft", "plan_version", String(pv.id));
  return undefined;
}

export function admin_publish_plan_version({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const pv = byId(tables, "plan_versions", args.p_plan_version_id);
  if (!pv) fail("PLAN_VERSION_NOT_FOUND");
  if (pv.status !== "draft") fail("PLAN_VERSION_IMMUTABLE");
  if (!rowsWhere(tables, "plan_version_venues", (x) => x.plan_version_id === pv.id).length) {
    fail("VALIDATION_FAILED", "a plan version needs at least one venue");
  }
  const now = nowIso();
  let previous: string | null = null;
  for (const other of rowsWhere(tables, "plan_versions", (x) => x.plan_id === pv.plan_id && x.status === "published")) {
    Object.assign(other, { status: "retired", retired_at: now });
    previous = String(other.id);
  }
  Object.assign(pv, { status: "published", published_at: now });
  audit(
    tables,
    actor,
    "admin",
    "plan_version.publish",
    "plan_version",
    String(pv.id),
    null,
    previous ? { retired_version_id: previous } : null,
    { status: "published" },
  );
  return undefined;
}

export function admin_retire_plan_version({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const pv = byId(tables, "plan_versions", args.p_plan_version_id);
  if (!pv || pv.status !== "published") fail("INVALID_TRANSITION");
  Object.assign(pv, { status: "retired", retired_at: nowIso() });
  audit(tables, actor, "admin", "plan_version.retire", "plan_version", String(pv.id));
  return undefined;
}

export function admin_operational_totals({ tables, actor }: RpcContext, args: Args) {
  requireAdmin(tables, actor);
  const from = String(args.p_from ?? "");
  const to = String(args.p_to ?? "");
  if (!from || !to || to <= from) fail("VALIDATION_FAILED", "date range");
  const within = (value: unknown) => typeof value === "string" && value >= from && value < to;
  const orderOf = (p: Row) => byId(tables, "orders", p.order_id);
  const payments = tables.payments ?? [];
  const realSucceeded = payments.filter((p) => orderOf(p)?.is_demo === false && within(p.succeeded_at));
  const realRefunded = payments.filter(
    (p) => orderOf(p)?.is_demo === false && p.status === "refunded" && within(p.refunded_at),
  );
  const sum = (rows: Row[]) => rows.reduce((total, p) => total + Number(p.amount_minor), 0);
  const memberships = (source: string) =>
    rowsWhere(tables, "memberships", (m) => m.source === source && within(m.created_at)).length;
  return {
    collected_minor: sum(realSucceeded),
    collected_count: realSucceeded.length,
    refunded_minor: sum(realRefunded),
    refunded_count: realRefunded.length,
    demo_payments_count: payments.filter((p) => orderOf(p)?.is_demo === true && within(p.succeeded_at)).length,
    memberships_payment: memberships("payment"),
    memberships_demo: memberships("demo"),
    memberships_admin: memberships("admin"),
    bookings_created: rowsWhere(tables, "bookings", (b) => within(b.created_at)).length,
    checkins: rowsWhere(tables, "checkins", (c) => within(c.checked_in_at)).length,
    no_shows: rowsWhere(tables, "bookings", (b) => b.state === "no_show" && within(b.session_starts_at)).length,
    late_cancellations: rowsWhere(tables, "bookings", (b) => b.state === "cancelled_late" && within(b.cancelled_at))
      .length,
    venue_cancellations: rowsWhere(tables, "bookings", (b) => b.state === "venue_cancelled" && within(b.cancelled_at))
      .length,
    orders_needing_reconciliation: rowsWhere(tables, "orders", (o) => o.needs_reconciliation === true).length,
    pending_orders: rowsWhere(tables, "orders", (o) => o.status === "pending").length,
    submitted_revisions: rowsWhere(tables, "venue_revisions", (r) => r.status === "submitted").length,
  } as Json;
}

export function admin_record_refund({ tables, actor }: RpcContext, args: Args) {
  const reason = requireReason(args.p_reason);
  requireAdmin(tables, actor);
  const reference = typeof args.p_reference === "string" ? args.p_reference.trim() : "";
  if (reference.length < 3 || reference.length > 200) fail("REFERENCE_REQUIRED");
  const order = byId(tables, "orders", args.p_order_id);
  if (!order) fail("ORDER_NOT_FOUND");
  lockMember(tables, String(order.user_id));
  if (order.status !== "paid") fail("ORDER_NOT_REFUNDABLE");
  const now = nowIso();
  for (const payment of rowsWhere(tables, "payments", (p) => p.order_id === order.id && p.status === "succeeded")) {
    Object.assign(payment, { status: "refunded", refunded_at: now });
    touch("payments", payment);
  }
  Object.assign(order, {
    status: "refunded",
    refunded_at: now,
    refund_reference: reference,
    needs_reconciliation: false,
    reconciliation_note:
      `${order.reconciliation_note ? `${order.reconciliation_note} | ` : ""}Refunded: ${reason}`.slice(0, 1000),
  });
  touch("orders", order);
  const membership = rowsWhere(tables, "memberships", (m) => m.order_id === order.id && m.status === "active")[0];
  if (membership) revokeMembershipCore(tables, actor, membership.id, `refunded: ${reason}`, "admin");
  audit(
    tables,
    actor,
    "admin",
    "order.refund",
    "order",
    String(order.id),
    reason,
    { status: "paid" },
    { status: "refunded" },
    {
      reference,
    },
  );
  return undefined;
}

export function admin_resolve_reconciliation({ tables, actor }: RpcContext, args: Args) {
  const note = requireReason(args.p_note);
  requireAdmin(tables, actor);
  const order = byId(tables, "orders", args.p_order_id);
  if (!order || order.needs_reconciliation !== true) fail("NOT_FOUND");
  Object.assign(order, {
    needs_reconciliation: false,
    reconciliation_note: `${order.reconciliation_note ? `${order.reconciliation_note} | ` : ""}Resolved: ${note}`.slice(
      0,
      1000,
    ),
  });
  touch("orders", order);
  audit(tables, actor, "admin", "order.reconcile", "order", String(order.id), note);
  return undefined;
}
