import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Actor,
  addMember,
  addMinutes,
  addStaff,
  bookableWorld,
  closeAll,
  createActivity,
  createOrg,
  createPlanVersion,
  createSession,
  createUser,
  createVenue,
  expectError,
  makeAdmin,
  sessionRow,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

const now = tashkent("2024-06-10 10:00");
const GYM = "ca000000-0000-4000-8000-000000000001";
const YOGA = "ca000000-0000-4000-8000-000000000002";
const SHOWERS = "a1000000-0000-4000-8000-000000000001";
const DISTRICT = "d1000000-0000-4000-8000-000000000003";

function hours(overrides: Record<number, { opens_at?: string; closes_at?: string; is_closed?: boolean }> = {}) {
  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i + 1,
    opens_at: "07:00",
    closes_at: "22:00",
    is_closed: false,
    ...overrides[i + 1],
  }));
}

function content(venueId: string, name = "Yangi Zal") {
  return {
    name: { uz: name, ru: "Новый зал", en: "New Hall" },
    description: { uz: "Tavsif", ru: "Описание", en: "Description" },
    address: { uz: "Namuna koʻchasi, 1" },
    rules: { uz: "Qoidalar" },
    district_id: DISTRICT,
    latitude: 41.3,
    longitude: 69.28,
    contact_phone: "+998711234567",
    category_ids: [GYM, YOGA],
    amenity_ids: [SHOWERS],
    images: [{ path: `venues/${venueId}/${randomUUID()}.webp`, alt: { uz: "Zal" } }],
    opening_hours: hours({ 7: { is_closed: true } }),
  };
}

let adminId: string;
let admin: Actor;

beforeAll(async () => {
  adminId = await createUser("Admin");
  await makeAdmin(adminId);
  admin = await Actor.as({ userId: adminId, aal: "aal2", now });
});

describe("venue drafts and approval", () => {
  it("publishes a partner-created venue only after admin approval, applying the reviewed content", async () => {
    const org = await createOrg();
    const managerId = await createUser("Manager");
    await addStaff(org, managerId, "manager");
    const manager = await Actor.member(managerId, now);
    const slug = `yangi-zal-${randomUUID().slice(0, 8)}`;

    // Images must live in the venue's own storage folder, which does not exist before creation.
    await expectError(
      manager.rpc("partner_create_venue", { p_organization_id: org, p_slug: slug, p_content: content(randomUUID()) }),
      "INVALID_CONTENT",
    );
    const [created] = await manager.rpc<{ partner_create_venue: string }>("partner_create_venue", {
      p_organization_id: org,
      p_slug: slug,
      p_content: { ...content("unused"), images: [] },
    });
    const id = created!.partner_create_venue;
    const anon = await Actor.anon(now);
    expect(await anon.query(`select id from public.venues where id = $1`, [id])).toEqual([]);

    const draft = content(id, "Yangi Zal Pro");
    await manager.rpc("partner_save_venue_revision", { p_venue_id: id, p_content: draft });
    await manager.rpc("partner_submit_venue_revision", { p_venue_id: id });
    // Submitted drafts are locked until reviewed or withdrawn.
    await expectError(
      manager.rpc("partner_save_venue_revision", { p_venue_id: id, p_content: draft }),
      "REVISION_LOCKED",
    );

    const [revision] = await sql<{ id: string }>(
      `select id from public.venue_revisions where venue_id = $1 and status = 'submitted'`,
      [id],
    );
    await admin.rpc("admin_review_venue_revision", {
      p_revision_id: revision!.id,
      p_approve: true,
      p_note: "Looks good",
    });

    const [venue] = await anon.query<{ publication_status: string; name: { uz: string } }>(
      `select publication_status, name from public.venues where id = $1`,
      [id],
    );
    expect(venue).toMatchObject({ publication_status: "published", name: { uz: "Yangi Zal Pro" } });
    const categories = await anon.query(`select category_id from public.venue_categories where venue_id = $1`, [id]);
    expect(categories).toHaveLength(2);
    const images = await anon.query<{ storage_path: string }>(
      `select storage_path from public.venue_images where venue_id = $1`,
      [id],
    );
    expect(images.map((i) => i.storage_path)).toEqual([draft.images[0]!.path]);
    const openingHours = await anon.query<{ weekday: number; is_closed: boolean }>(
      `select weekday, is_closed from public.venue_opening_hours where venue_id = $1 order by weekday`,
      [id],
    );
    expect(openingHours.filter((h) => h.is_closed).map((h) => h.weekday)).toEqual([7]);
  });

  it("keeps published content unchanged until an edit is approved, and records rejections", async () => {
    const org = await createOrg();
    const venueId = await createVenue(org, { name: "Original Name" });
    const managerId = await createUser();
    await addStaff(org, managerId, "manager");
    const manager = await Actor.member(managerId, now);

    await manager.rpc("partner_save_venue_revision", { p_venue_id: venueId, p_content: content(venueId, "Renamed") });
    await manager.rpc("partner_submit_venue_revision", { p_venue_id: venueId });
    const anon = await Actor.anon(now);
    const [before] = await anon.query<{ name: { uz: string } }>(`select name from public.venues where id = $1`, [
      venueId,
    ]);
    expect(before!.name.uz).toBe("Original Name");

    const [revision] = await sql<{ id: string }>(
      `select id from public.venue_revisions where venue_id = $1 and status = 'submitted'`,
      [venueId],
    );
    await expectError(
      admin.rpc("admin_review_venue_revision", { p_revision_id: revision!.id, p_approve: false, p_note: "" }),
      "REASON_REQUIRED",
    );
    await admin.rpc("admin_review_venue_revision", {
      p_revision_id: revision!.id,
      p_approve: false,
      p_note: "Photo is blurry",
    });
    const [after] = await anon.query<{ name: { uz: string } }>(`select name from public.venues where id = $1`, [
      venueId,
    ]);
    expect(after!.name.uz).toBe("Original Name");
    const [reviewed] = await sql(`select status, review_note from public.venue_revisions where id = $1`, [
      revision!.id,
    ]);
    expect(reviewed).toEqual({ status: "rejected", review_note: "Photo is blurry" });
  });

  it("validates draft content", async () => {
    const org = await createOrg();
    const venueId = await createVenue(org);
    const managerId = await createUser();
    await addStaff(org, managerId, "manager");
    const manager = await Actor.member(managerId, now);
    const cases: Array<[string, Record<string, unknown>]> = [
      ["name", { name: { ru: "Нет узбекского" } }],
      ["category_ids", { category_ids: [] }],
      ["images", { images: [{ path: `venues/${randomUUID()}/${randomUUID()}.webp` }] }],
      ["images", { images: [{ path: `venues/${venueId}/../../etc/passwd` }] }],
      ["opening_hours", { opening_hours: hours({ 1: { opens_at: "22:00", closes_at: "07:00" } }) }],
      ["opening_hours", { opening_hours: hours().slice(0, 6) }],
      ["contact_phone", { contact_phone: "+99890" }],
      ["coordinates", { latitude: 41.3, longitude: null }],
    ];
    for (const [field, override] of cases) {
      let detail = "";
      try {
        await manager.rpc("partner_save_venue_revision", {
          p_venue_id: venueId,
          p_content: { ...content(venueId), ...override },
        });
      } catch (e) {
        const err = e as { message: string; detail?: string };
        expect(err.message).toBe("INVALID_CONTENT");
        detail = err.detail ?? "";
      }
      expect(detail, JSON.stringify(override)).toBe(field);
    }
  });
});

describe("venue status controls", () => {
  it("unpublishes with a reason and optionally releases future reservations", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, tashkent("2024-06-11 18:00"));
    const { booking_id } = await (
      await Actor.member(w.memberId, now)
    ).rpcOne<{ booking_id: string }>("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });
    await expectError(
      admin.rpc("admin_set_venue_status", { p_venue_id: w.venueId, p_action: "unpublish", p_reason: null }),
      "REASON_REQUIRED",
    );
    const [released] = await admin.rpc<{ admin_set_venue_status: number }>("admin_set_venue_status", {
      p_venue_id: w.venueId,
      p_action: "suspend",
      p_reason: "Safety inspection",
      p_cancel_future_sessions: true,
    });
    expect(released!.admin_set_venue_status).toBe(1);
    const [booking] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [booking_id]);
    expect(booking!.state).toBe("venue_cancelled");
    expect((await sessionRow(sessionId)).status).toBe("cancelled");
    expect(await (await Actor.anon(now)).query(`select id from public.venues where id = $1`, [w.venueId])).toEqual([]);

    await admin.rpc("admin_set_venue_status", { p_venue_id: w.venueId, p_action: "reinstate" });
    expect(await (await Actor.anon(now)).query(`select id from public.venues where id = $1`, [w.venueId])).toHaveLength(
      1,
    );
  });
});

describe("sessions", () => {
  it("creates sessions from venue-local times and refuses past or duplicate ones", async () => {
    const org = await createOrg();
    const venueId = await createVenue(org);
    const activityId = await createActivity(venueId, { durationMinutes: 90, capacity: 12 });
    const managerId = await createUser();
    await addStaff(org, managerId, "manager");
    const manager = await Actor.member(managerId, now);

    const ids = await manager.rpc<{ partner_create_sessions: string }>("partner_create_sessions", {
      p_activity_id: activityId,
      p_local_starts: ["2024-06-11 07:30", "2024-06-12 23:30"],
      p_capacity: null,
    });
    expect(ids).toHaveLength(2);
    const rows = await sql<{ starts_at: Date; ends_at: Date; capacity: number }>(
      `select starts_at, ends_at, capacity from public.sessions where id = any ($1) order by starts_at`,
      [ids.map((r) => r.partner_create_sessions)],
    );
    expect(rows[0]!.starts_at.toISOString()).toBe("2024-06-11T02:30:00.000Z");
    expect(rows[1]!.starts_at.toISOString()).toBe("2024-06-12T18:30:00.000Z");
    expect(rows[1]!.ends_at.toISOString()).toBe("2024-06-12T20:00:00.000Z");
    expect(rows.map((r) => r.capacity)).toEqual([12, 12]);

    await expectError(
      manager.rpc("partner_create_sessions", { p_activity_id: activityId, p_local_starts: ["2024-06-10 09:00"] }),
      "SESSION_IN_PAST",
    );
    await expectError(
      manager.rpc("partner_create_sessions", { p_activity_id: activityId, p_local_starts: ["2024-06-11 07:30"] }),
      "SESSION_DUPLICATE",
    );
  });

  it("never reduces capacity below occupied places and never edits booked times silently", async () => {
    const w = await bookableWorld(now);
    const managerId = await createUser();
    await addStaff(w.orgId, managerId, "manager");
    const manager = await Actor.member(managerId, now);
    const sessionId = await createSession(w.activityId, tashkent("2024-06-11 18:00"), { capacity: 3 });
    await (
      await Actor.member(w.memberId, now)
    ).rpc("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });
    const other = await addMember(w.planVersionId, now);
    await (
      await Actor.member(other.memberId, now)
    ).rpc("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });

    await expectError(
      manager.rpc("partner_update_session_capacity", { p_session_id: sessionId, p_capacity: 1 }),
      "CAPACITY_BELOW_OCCUPIED",
    );
    await manager.rpc("partner_update_session_capacity", { p_session_id: sessionId, p_capacity: 2 });
    expect(await sessionRow(sessionId)).toMatchObject({ capacity: 2, occupied_count: 2 });

    // Even privileged direct writes cannot move a session or overbook it.
    await expectError(
      sql(`update public.sessions set starts_at = starts_at + interval '1 hour' where id = $1`, [sessionId]),
      "SESSION_TIME_IMMUTABLE",
    );
    await expectError(
      sql(`update public.sessions set capacity = 1 where id = $1`, [sessionId]),
      "CAPACITY_BELOW_OCCUPIED",
    );
  });

  it("shows staff a minimal roster", async () => {
    const w = await bookableWorld(now);
    const receptionist = await createUser();
    await addStaff(w.orgId, receptionist, "receptionist");
    const sessionId = await createSession(w.activityId, tashkent("2024-06-11 18:00"));
    await (
      await Actor.member(w.memberId, now)
    ).rpc("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });
    const roster = await (await Actor.member(receptionist, now)).rpc("get_session_roster", { p_session_id: sessionId });
    expect(roster).toHaveLength(1);
    expect(Object.keys(roster[0]!).sort()).toEqual(
      ["booked_at", "booking_id", "booking_state", "checked_in_at", "member_display_name"].sort(),
    );
    expect(roster[0]!.member_display_name).toBe("Test Member");
  });
});

describe("plan versions", () => {
  it("freezes published terms and eligibility; changes create a new version", async () => {
    const org = await createOrg();
    const venueA = await createVenue(org);
    const venueB = await createVenue(org);
    const v1 = await createPlanVersion([venueA]);
    await expectError(
      sql(`update public.plan_versions set price_minor = 1 where id = $1`, [v1]),
      "PLAN_VERSION_IMMUTABLE",
    );
    await expectError(
      sql(`insert into public.plan_version_venues (plan_version_id, venue_id) values ($1, $2)`, [v1, venueB]),
      "PLAN_VERSION_IMMUTABLE",
    );
    await expectError(
      sql(`delete from public.plan_version_venues where plan_version_id = $1`, [v1]),
      "PLAN_VERSION_IMMUTABLE",
    );

    const [{ plan_id: planId }] = await sql<{ plan_id: string }>(
      `select plan_id from public.plan_versions where id = $1`,
      [v1],
    );
    const member = await createUser();
    const membership = await admin.rpcOne<{ admin_grant_membership: string }>("admin_grant_membership", {
      p_user_id: member,
      p_plan_version_id: v1,
      p_reason: "Pilot participant",
    });

    const [created] = await admin.rpc<{ admin_create_plan_version: string }>("admin_create_plan_version", {
      p_plan_id: planId,
      p_terms: {
        name: { uz: "Test plan", ru: "Тест", en: "Test" },
        price_minor: 35_000_000,
        duration_days: 30,
        visit_allowance: 10,
      },
      p_venue_ids: [venueA, venueB],
    });
    const v2 = created!.admin_create_plan_version;
    await admin.rpc("admin_publish_plan_version", { p_plan_version_id: v2 });

    const versions = await sql<{ id: string; status: string; version: number }>(
      `select id, status, version from public.plan_versions where plan_id = $1 order by version`,
      [planId],
    );
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, "retired"],
      [2, "published"],
    ]);
    const [m] = await sql<{ plan_version_id: string }>(`select plan_version_id from public.memberships where id = $1`, [
      membership.admin_grant_membership,
    ]);
    expect(m!.plan_version_id).toBe(v1);

    await expectError(
      admin.rpc("admin_create_plan_version", {
        p_plan_id: planId,
        p_terms: { name: { uz: "Bad" }, price_minor: -5, duration_days: 30, visit_allowance: 10 },
        p_venue_ids: [venueA],
      }),
      "VALIDATION_FAILED",
    );
  });
});

describe("audited admin operations", () => {
  it("grants and revokes memberships with reasons and audit entries", async () => {
    const org = await createOrg();
    const venue = await createVenue(org);
    const pv = await createPlanVersion([venue]);
    const member = await createUser();

    await expectError(
      admin.rpc("admin_grant_membership", { p_user_id: member, p_plan_version_id: pv, p_reason: "" }),
      "REASON_REQUIRED",
    );
    const { admin_grant_membership: membershipId } = await admin.rpcOne<{ admin_grant_membership: string }>(
      "admin_grant_membership",
      { p_user_id: member, p_plan_version_id: pv, p_reason: "Compensation for outage" },
    );
    await expectError(
      admin.rpc("admin_grant_membership", { p_user_id: member, p_plan_version_id: pv, p_reason: "Second" }),
      "MEMBERSHIP_ALREADY_ACTIVE",
    );
    await admin.rpc("admin_revoke_membership", { p_membership_id: membershipId, p_reason: "Granted by mistake" });

    const audit = await sql<{ action: string; reason: string; actor_id: string }>(
      `select action, reason, actor_id from public.audit_logs where target_id = $1 order by id`,
      [membershipId],
    );
    expect(audit).toEqual([
      { action: "membership.grant", reason: "Compensation for outage", actor_id: adminId },
      { action: "membership.revoke", reason: "Granted by mistake", actor_id: adminId },
    ]);
    const notices = await sql(`select message_key from public.notifications where user_id = $1 order by created_at`, [
      member,
    ]);
    expect(notices.map((n) => n.message_key)).toEqual(["membership_granted", "membership_revoked"]);
  });

  it("corrects final booking states only through the audited operation", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, tashkent("2024-06-11 18:00"));
    const { booking_id } = await (
      await Actor.member(w.memberId, now)
    ).rpcOne<{ booking_id: string }>("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });
    await (await Actor.service(tashkent("2024-06-11 20:00"))).rpc("reconcile_no_shows", { p_limit: 1000 });
    await expectError(
      sql(`update public.bookings set state = 'checked_in', checked_in_at = now() where id = $1`, [booking_id]),
      "BOOKING_INVALID_TRANSITION",
    );
    await expectError(
      admin.rpc("admin_correct_booking", { p_booking_id: booking_id, p_new_state: "confirmed", p_reason: "Undo" }),
      "INVALID_TRANSITION",
    );
    await admin.rpc("admin_correct_booking", {
      p_booking_id: booking_id,
      p_new_state: "checked_in",
      p_reason: "Scanner was offline; attendance confirmed by venue",
    });
    const [row] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [booking_id]);
    expect(row!.state).toBe("checked_in");
    expect(await sql(`select 1 from public.checkins where booking_id = $1`, [booking_id])).toHaveLength(1);
    const audit = await sql(
      `select action from public.audit_logs where target_id = $1 and action = 'booking.correct'`,
      [booking_id],
    );
    expect(audit).toHaveLength(1);
  });

  it("anonymizes an account while retaining reservations and attendance", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, tashkent("2024-06-11 18:00"));
    const { booking_id } = await (
      await Actor.member(w.memberId, now)
    ).rpcOne<{ booking_id: string }>("create_booking", {
      p_session_id: sessionId,
      p_idempotency_key: randomUUID(),
    });
    await sql(`update public.profiles set phone_e164 = '+998901112233' where id = $1`, [w.memberId]);
    await admin.rpc("admin_anonymize_user", { p_user_id: w.memberId, p_reason: "Deletion request" });

    const [profile] = await sql(
      `select display_name, phone_e164, anonymized_at is not null as anonymized from public.profiles where id = $1`,
      [w.memberId],
    );
    expect(profile).toEqual({ display_name: "", phone_e164: null, anonymized: true });
    const [booking] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [booking_id]);
    expect(booking!.state).toBe("cancelled_on_time");
    const [status] = await sql(`select status from public.account_statuses where user_id = $1`, [w.memberId]);
    expect(status).toEqual({ status: "suspended" });
    await expectError(sql(`delete from auth.users where id = $1`, [w.memberId]), "23503");
  });

  it("reports operational totals separating demo activity from collected money", async () => {
    const [row] = await admin.rpc<{ admin_operational_totals: Record<string, number> }>("admin_operational_totals", {
      p_from: addMinutes(now, -60 * 24 * 365),
      p_to: addMinutes(now, 60 * 24 * 365),
    });
    const totals = row!.admin_operational_totals;
    for (const key of [
      "collected_minor",
      "refunded_minor",
      "demo_payments_count",
      "memberships_payment",
      "memberships_demo",
      "memberships_admin",
      "bookings_created",
      "checkins",
      "no_shows",
      "orders_needing_reconciliation",
    ]) {
      expect(totals, key).toHaveProperty(key);
    }
    await expectError(
      admin.rpc("admin_operational_totals", { p_from: now, p_to: addMinutes(now, -1) }),
      "VALIDATION_FAILED",
    );
  });
});
