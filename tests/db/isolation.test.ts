import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Actor,
  addStaff,
  bookableWorld,
  closeAll,
  createActivity,
  createOrg,
  createSession,
  createUser,
  createVenue,
  expectError,
  makeAdmin,
  setSetting,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

const now = tashkent("2024-05-13 10:00");

describe("member data isolation", () => {
  let a: Awaited<ReturnType<typeof bookableWorld>>;
  let bId: string;
  let bBooking: string;

  beforeAll(async () => {
    a = await bookableWorld(now);
    const b = await bookableWorld(now);
    bId = b.memberId;
    const sessionId = await createSession(b.activityId, tashkent("2024-05-14 18:00"));
    const actorB = await Actor.member(bId, now);
    bBooking = (
      await actorB.rpcOne<{ booking_id: string }>("create_booking", {
        p_session_id: sessionId,
        p_idempotency_key: randomUUID(),
      })
    ).booking_id;
    // B also has an order with a payment, an attendance record, and a favorite.
    const [order] = await sql<{ id: string }>(
      `insert into public.orders (user_id, plan_version_id, amount_minor, currency, provider, is_demo, status, expires_at, paid_at)
       values ($1, $2, 100, 'UZS', 'demo', true, 'paid', now(), now()) returning id`,
      [bId, b.planVersionId],
    );
    await sql(
      `insert into public.payments (order_id, provider, provider_transaction_id, amount_minor, currency, status, succeeded_at)
       values ($1, 'demo', $2, 100, 'UZS', 'succeeded', now())`,
      [order!.id, `isolation-${randomUUID()}`],
    );
    await sql(`update public.bookings set state = 'checked_in', checked_in_at = now() where id = $1`, [bBooking]);
    await sql(`insert into public.checkins (booking_id, venue_id, checked_in_at, verified_by) values ($1, $2, now(), $3)`, [
      bBooking,
      b.venueId,
      bId,
    ]);
    await sql(`insert into public.favorites (user_id, venue_id) values ($1, $2)`, [bId, b.venueId]);
  });

  it("cannot read another member's records", async () => {
    const actorA = await Actor.member(a.memberId, now);
    for (const table of ["account_statuses", "memberships", "bookings", "orders", "favorites", "notifications"]) {
      expect(await actorA.query(`select * from public.${table} where user_id = $1`, [bId]), table).toEqual([]);
    }
    expect(await actorA.query(`select * from public.profiles where id = $1`, [bId])).toEqual([]);
    // A has no payments or attendance of its own, so any visible row would belong to someone else.
    expect(await actorA.query(`select * from public.payments`)).toEqual([]);
    expect(await actorA.query(`select * from public.checkins`)).toEqual([]);
    expect(await actorA.rpc("get_my_booking", { p_booking_id: bBooking })).toEqual([]);
    const past = await actorA.rpc("get_my_bookings", { p_scope: "past", p_limit: 100, p_offset: 0 });
    expect(past.map((r) => r.booking_id)).not.toContain(bBooking);

    // B can read its own records through the same policies.
    const actorB = await Actor.member(bId, now);
    expect(await actorB.query(`select id from public.payments`)).toHaveLength(1);
    expect(await actorB.query(`select id from public.checkins`)).toHaveLength(1);
  });

  it("cannot grant itself roles, entitlement, or payment status through direct writes", async () => {
    const actorA = await Actor.member(a.memberId, now);
    const attempts: Array<[string, unknown[]]> = [
      [`insert into public.platform_roles (user_id, role) values ($1, 'admin')`, [a.memberId]],
      [`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'manager')`, [a.orgId, a.memberId]],
      [`update public.account_statuses set status = 'active' where user_id = $1`, [a.memberId]],
      [`insert into public.memberships (user_id, plan_version_id, starts_at, ends_at, source, grant_reason)
        values ($1, $2, now(), now() + interval '30 days', 'admin', 'self')`, [a.memberId, a.planVersionId]],
      [`update public.memberships set ends_at = ends_at + interval '365 days' where user_id = $1`, [a.memberId]],
      [`update public.bookings set state = 'cancelled_on_time' where user_id = $1`, [a.memberId]],
      [`insert into public.orders (user_id, plan_version_id, amount_minor, currency, provider, is_demo, status, expires_at)
        values ($1, $2, 0, 'UZS', 'demo', true, 'paid', now())`, [a.memberId, a.planVersionId]],
      [`update public.orders set status = 'paid' where user_id = $1`, [a.memberId]],
      [`insert into public.payments (order_id, provider, provider_transaction_id, amount_minor, currency, status)
        values ($1, 'demo', 'x', 0, 'UZS', 'succeeded')`, [randomUUID()]],
      [`insert into public.checkins (booking_id, venue_id, checked_in_at, verified_by) values ($1, $2, now(), $3)`, [randomUUID(), a.venueId, a.memberId]],
      [`insert into public.audit_logs (actor_role, action, target_type) values ('admin', 'fake.entry', 'user')`, []],
      [`update public.sessions set capacity = 500`, []],
      [`insert into public.bookings (user_id) values ($1)`, [a.memberId]],
      [`delete from public.bookings where user_id = $1`, [a.memberId]],
    ];
    for (const [text, params] of attempts) {
      await expectError(actorA.query(text, params), "42501");
    }
    // Profile: only the permitted fields of the member's own row.
    await expectError(actorA.query(`update public.profiles set anonymized_at = now() where id = $1`, [a.memberId]), "42501");
    const updatedOther = await actorA.query(`update public.profiles set display_name = 'x' where id = $1 returning id`, [bId]);
    expect(updatedOther).toEqual([]);
    const updatedOwn = await actorA.query(
      `update public.profiles set display_name = 'Alisher', phone_e164 = '+998901234567', locale = 'ru' where id = $1 returning display_name`,
      [a.memberId],
    );
    expect(updatedOwn).toEqual([{ display_name: "Alisher" }]);
    await expectError(
      actorA.query(`update public.profiles set phone_e164 = '+99890123' where id = $1`, [a.memberId]),
      "23514", // check_violation: Uzbekistan numbers need nine national digits
    );
  });

  it("cannot call privileged payment, job, or admin functions", async () => {
    const actorA = await Actor.member(a.memberId, now);
    await expectError(
      actorA.rpc("apply_payment_event", {
        p_provider: "demo",
        p_dedup_key: randomUUID(),
        p_event_type: "payment.succeeded",
        p_order_id: randomUUID(),
        p_provider_transaction_id: "t",
        p_amount_minor: 1,
        p_currency: "UZS",
        p_status: "succeeded",
      }),
      "42501",
    );
    await expectError(actorA.rpc("consume_rate_limit", { p_bucket: "x", p_max: 1, p_window_seconds: 1 }), "42501");
    await expectError(actorA.rpc("expire_stale_orders", { p_limit: 1 }), "42501");
    await expectError(actorA.rpc("admin_grant_membership", {
      p_user_id: a.memberId,
      p_plan_version_id: a.planVersionId,
      p_reason: "self grant",
    }), "FORBIDDEN");
    await expectError(actorA.rpc("admin_set_account_status", {
      p_user_id: a.memberId,
      p_status: "active",
      p_reason: "self",
    }), "FORBIDDEN");
  });
});

describe("visitor catalog access", () => {
  it("shows published venues and hides drafts, unpublished and suspended venues everywhere", async () => {
    const org = await createOrg();
    const published = await createVenue(org);
    const draft = await createVenue(org, { publication: "draft" });
    const unpublished = await createVenue(org, { publication: "unpublished" });
    const suspended = await createVenue(org, { operational: "suspended" });
    for (const venue of [published, draft, unpublished, suspended]) {
      await createSession(await createActivity(venue), tashkent("2024-05-14 12:00"));
    }
    const anon = await Actor.anon(now);
    const visible = (await anon.query<{ id: string }>(`select id from public.venues where organization_id = $1`, [org])).map(
      (r) => r.id,
    );
    expect(visible).toEqual([published]);
    const sessions = await anon.query<{ venue_id: string }>(
      `select venue_id from public.sessions where venue_id = any ($1)`,
      [[published, draft, unpublished, suspended]],
    );
    expect(new Set(sessions.map((s) => s.venue_id))).toEqual(new Set([published]));
    const activities = await anon.query(`select id from public.activities where venue_id = any ($1)`, [[draft, unpublished, suspended]]);
    expect(activities).toEqual([]);

    const search = await anon.rpc<{ id: string }>("search_venues", { p_limit: 48 });
    const ids = search.map((r) => r.id);
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(unpublished);
    expect(ids).not.toContain(suspended);

    // A partner manager sees its own drafts directly, but never in public search.
    const manager = await createUser();
    await addStaff(org, manager, "manager");
    const managerActor = await Actor.member(manager, now);
    const own = await managerActor.query<{ id: string }>(`select id from public.venues where organization_id = $1`, [org]);
    expect(own).toHaveLength(4);
    const managerSearch = (await managerActor.rpc<{ id: string }>("search_venues", { p_limit: 48 })).map((r) => r.id);
    expect(managerSearch).not.toContain(draft);
  });

  it("hides every venue of a suspended organization", async () => {
    const org = await createOrg();
    const venue = await createVenue(org);
    await sql(`update public.organizations set status = 'suspended', status_reason = 'test' where id = $1`, [org]);
    const anon = await Actor.anon(now);
    expect(await anon.query(`select id from public.venues where id = $1`, [venue])).toEqual([]);
  });
});

describe("partner isolation", () => {
  let orgA: string;
  let orgB: string;
  let venueB: string;
  let draftB: string;
  let activityB: string;
  let sessionB: string;
  let managerA: string;
  let managerB: string;
  let receptionistB: string;

  beforeAll(async () => {
    orgA = await createOrg("Partner A");
    orgB = await createOrg("Partner B");
    await createVenue(orgA);
    venueB = await createVenue(orgB);
    draftB = await createVenue(orgB, { publication: "draft" });
    activityB = await createActivity(venueB);
    sessionB = await createSession(activityB, tashkent("2024-05-14 18:00"));
    managerA = await createUser("Manager A");
    managerB = await createUser("Manager B");
    receptionistB = await createUser("Reception B");
    await addStaff(orgA, managerA, "manager");
    await addStaff(orgB, managerB, "manager");
    await addStaff(orgB, receptionistB, "receptionist");
    await sql(
      `insert into public.venue_revisions (venue_id, status, content, created_by) values ($1, 'draft', '{"note": "secret"}', $2)`,
      [draftB, managerB],
    );
  });

  it("cannot read Partner B's drafts, revisions, rosters, or reports", async () => {
    const a = await Actor.member(managerA, now);
    expect(await a.query(`select id from public.venues where id = $1`, [draftB])).toEqual([]);
    expect(await a.query(`select id from public.venue_revisions where venue_id = $1`, [draftB])).toEqual([]);
    expect(await a.query(`select id from public.organizations where id = $1`, [orgB])).toEqual([]);
    await expectError(a.rpc("get_session_roster", { p_session_id: sessionB }), "FORBIDDEN");
    await expectError(a.rpc("partner_day_sessions", { p_venue_id: venueB, p_date: "2024-05-14" }), "FORBIDDEN");
    await expectError(
      a.rpc("partner_attendance_report", { p_venue_id: venueB, p_from: "2024-05-01", p_to: "2024-05-31" }),
      "FORBIDDEN",
    );
  });

  it("cannot mutate Partner B's venues, activities, or sessions", async () => {
    const a = await Actor.member(managerA, now);
    await expectError(a.rpc("partner_save_venue_revision", { p_venue_id: draftB, p_content: {} }), "FORBIDDEN");
    await expectError(a.rpc("partner_submit_venue_revision", { p_venue_id: draftB }), "FORBIDDEN");
    await expectError(
      a.rpc("partner_create_activity", {
        p_venue_id: venueB,
        p_category_id: "ca000000-0000-4000-8000-000000000001",
        p_kind: "class",
        p_title: { uz: "Hijack" },
        p_description: { uz: "" },
        p_duration_minutes: 60,
        p_default_capacity: 10,
      }),
      "FORBIDDEN",
    );
    await expectError(
      a.rpc("partner_create_sessions", { p_activity_id: activityB, p_local_starts: ["2024-05-20 10:00"], p_capacity: 5 }),
      "FORBIDDEN",
    );
    await expectError(a.rpc("partner_update_session_capacity", { p_session_id: sessionB, p_capacity: 1 }), "FORBIDDEN");
    await expectError(a.rpc("cancel_session", { p_session_id: sessionB, p_reason: "hijack" }), "FORBIDDEN");
    await expectError(
      a.rpc("partner_create_venue", { p_organization_id: orgB, p_slug: `hijack-${randomUUID().slice(0, 8)}`, p_content: {} }),
      "FORBIDDEN",
    );
  });

  it("lets receptionists view rosters but not manage schedules or venues", async () => {
    const r = await Actor.member(receptionistB, now);
    expect(await r.rpc("get_session_roster", { p_session_id: sessionB })).toEqual([]);
    await expectError(r.rpc("partner_update_session_capacity", { p_session_id: sessionB, p_capacity: 20 }), "FORBIDDEN");
    await expectError(r.rpc("partner_save_venue_revision", { p_venue_id: draftB, p_content: {} }), "FORBIDDEN");
    expect(await r.query(`select id from public.venue_revisions where venue_id = $1`, [draftB])).toEqual([]);
    await expectError(
      r.rpc("partner_attendance_report", { p_venue_id: venueB, p_from: "2024-05-01", p_to: "2024-05-31" }),
      "FORBIDDEN",
    );
  });

  it("removes staff powers when the staff account or organization is suspended", async () => {
    const b = await Actor.member(managerB, now);
    expect(await b.rpc("partner_day_sessions", { p_venue_id: venueB, p_date: "2024-05-14" })).toHaveLength(1);
    await sql(`update public.account_statuses set status = 'suspended', reason = 'test' where user_id = $1`, [managerB]);
    await expectError(b.rpc("partner_day_sessions", { p_venue_id: venueB, p_date: "2024-05-14" }), "ACCOUNT_SUSPENDED");
    await sql(`update public.account_statuses set status = 'active', reason = null where user_id = $1`, [managerB]);
    await sql(`update public.organizations set status = 'suspended', status_reason = 'test' where id = $1`, [orgB]);
    await expectError(b.rpc("partner_day_sessions", { p_venue_id: venueB, p_date: "2024-05-14" }), "FORBIDDEN");
    await sql(`update public.organizations set status = 'active', status_reason = null where id = $1`, [orgB]);
  });
});

describe("admin authorization", () => {
  it("requires a second factor when admin MFA is required", async () => {
    const admin = await createUser("Admin");
    await makeAdmin(admin);
    await setSetting("admin_mfa_required", true);
    try {
      const aal1 = await Actor.as({ userId: admin, aal: "aal1", now });
      await expectError(aal1.rpc("admin_operational_totals", { p_from: "2024-01-01", p_to: "2024-12-31" }), "MFA_REQUIRED");
      expect(await aal1.query(`select id from public.audit_logs limit 1`)).toEqual([]);

      const aal2 = await Actor.as({ userId: admin, aal: "aal2", now });
      const [totals] = await aal2.rpc<{ admin_operational_totals: Record<string, number> }>("admin_operational_totals", {
        p_from: "2024-01-01",
        p_to: "2024-12-31",
      });
      expect(totals!.admin_operational_totals).toHaveProperty("collected_minor");
      expect((await aal2.query(`select id from public.audit_logs limit 1`)).length).toBe(1);
    } finally {
      await setSetting("admin_mfa_required", false);
    }
  });

  it("loses admin authority when the admin account is suspended", async () => {
    const admin = await createUser("Admin");
    await makeAdmin(admin);
    const actor = await Actor.as({ userId: admin, aal: "aal2", now });
    await sql(`update public.account_statuses set status = 'suspended', reason = 'test' where user_id = $1`, [admin]);
    await expectError(actor.rpc("admin_find_users", { p_query: "x" }), "FORBIDDEN");
  });
});
