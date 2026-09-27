import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Actor,
  addMember,
  addMinutes,
  bookableWorld,
  closeAll,
  createActivity,
  createMembership,
  createOrg,
  createPlanVersion,
  createSession,
  createUser,
  createVenue,
  expectError,
  membershipUsage,
  sessionRow,
  settle,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

type BookingResult = { booking_id: string; booking_state: string; replayed: boolean };

function book(actor: Actor, sessionId: string, key: string = randomUUID()) {
  return actor.rpcOne<BookingResult>("create_booking", { p_session_id: sessionId, p_idempotency_key: key });
}

describe("create_booking", () => {
  const now = tashkent("2024-03-11 10:00"); // Monday

  it("reserves an eligible session and snapshots the applied policy", async () => {
    const w = await bookableWorld(now);
    const start = tashkent("2024-03-12 18:00");
    const sessionId = await createSession(w.activityId, start, { capacity: 5 });
    const member = await Actor.member(w.memberId, now);

    const result = await book(member, sessionId);
    expect(result.booking_state).toBe("confirmed");
    expect(result.replayed).toBe(false);

    const [row] = await sql<Record<string, string>>(
      `select local_date::text, cancellation_deadline, checkin_opens_at, checkin_closes_at, membership_id, venue_id,
              policy_snapshot ->> 'free_cancellation_minutes' as free_minutes
         from public.bookings where id = $1`,
      [result.booking_id],
    );
    expect(row!.local_date).toBe("2024-03-12");
    expect(new Date(row!.cancellation_deadline!).toISOString()).toBe(addMinutes(start, -120).toISOString());
    expect(new Date(row!.checkin_opens_at!).toISOString()).toBe(addMinutes(start, -15).toISOString());
    expect(new Date(row!.checkin_closes_at!).toISOString()).toBe(addMinutes(start, 30).toISOString());
    expect(row!.membership_id).toBe(w.membershipId);
    expect(row!.free_minutes).toBe("120");

    expect((await sessionRow(sessionId)).occupied_count).toBe(1);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 1 });

    const notices = await sql(`select message_key from public.notifications where user_id = $1`, [w.memberId]);
    expect(notices.map((n) => n.message_key)).toContain("booking_confirmed");
    const audit = await sql(`select action from public.audit_logs where target_id = $1`, [result.booking_id]);
    expect(audit.map((a) => a.action)).toContain("booking.create");
  });

  it("closes the check-in window at the session end when the session is shorter than 30 minutes", async () => {
    const orgId = await createOrg();
    const venueId = await createVenue(orgId);
    const activityId = await createActivity(venueId, { durationMinutes: 20 });
    const pv = await createPlanVersion([venueId]);
    const { memberId } = await addMember(pv, now);
    const start = tashkent("2024-03-12 09:00");
    const sessionId = await createSession(activityId, start, { durationMinutes: 20 });
    const result = await book(await Actor.member(memberId, now), sessionId);
    const [row] = await sql<{ checkin_closes_at: Date }>(`select checkin_closes_at from public.bookings where id = $1`, [
      result.booking_id,
    ]);
    expect(row!.checkin_closes_at.toISOString()).toBe(addMinutes(start, 20).toISOString());
  });

  it("requires a signed-in member", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
    const anon = await Actor.anon(now);
    await expectError(book(anon, sessionId), "42501"); // no EXECUTE grant for anon
  });

  describe("entitlement", () => {
    it("rejects members without any membership", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      const stranger = await Actor.member(await createUser(), now);
      await expectError(book(stranger, sessionId), "MEMBERSHIP_REQUIRED");
    });

    it("rejects expired and revoked memberships", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));

      const expired = await createUser();
      await createMembership(expired, w.planVersionId, tashkent("2024-01-01 10:00"), tashkent("2024-01-31 10:00"));
      await expectError(book(await Actor.member(expired, now), sessionId), "MEMBERSHIP_REQUIRED");

      const revoked = await createUser();
      await createMembership(revoked, w.planVersionId, addMinutes(now, -60), addMinutes(now, 60 * 24 * 20), {
        status: "revoked",
      });
      await expectError(book(await Actor.member(revoked, now), sessionId), "MEMBERSHIP_REQUIRED");
    });

    it("uses a half-open validity interval: the session must end by the membership end", async () => {
      const w = await bookableWorld(now);
      const member = await createUser();
      const membershipEnd = tashkent("2024-03-12 19:00");
      await createMembership(member, w.planVersionId, addMinutes(now, -60), membershipEnd);
      const actor = await Actor.member(member, now);

      const endsExactly = await createSession(w.activityId, tashkent("2024-03-12 18:00")); // ends 19:00
      const endsAfter = await createSession(w.activityId, tashkent("2024-03-12 18:30")); // ends 19:30

      await expectError(book(actor, endsAfter), "MEMBERSHIP_EXPIRES_BEFORE_SESSION");
      expect((await book(actor, endsExactly)).booking_state).toBe("confirmed");
    });

    it("rejects venues outside the plan version", async () => {
      const w = await bookableWorld(now);
      const otherVenue = await createVenue(w.orgId);
      const otherActivity = await createActivity(otherVenue);
      const sessionId = await createSession(otherActivity, tashkent("2024-03-12 18:00"));
      await expectError(book(await Actor.member(w.memberId, now), sessionId), "PLAN_NOT_ELIGIBLE");
    });

    it("rejects suspended accounts", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      await sql(`update public.account_statuses set status = 'suspended', reason = 'test' where user_id = $1`, [
        w.memberId,
      ]);
      await expectError(book(await Actor.member(w.memberId, now), sessionId), "ACCOUNT_SUSPENDED");
    });
  });

  describe("session and venue state", () => {
    it("rejects started, cancelled, too-far, and unpublished sessions", async () => {
      const w = await bookableWorld(now);
      const actor = await Actor.member(w.memberId, now);

      const started = await createSession(w.activityId, now);
      await expectError(book(actor, started), "BOOKING_CLOSED");

      const cancelled = await createSession(w.activityId, tashkent("2024-03-13 18:00"));
      await sql(
        `update public.sessions set status = 'cancelled', cancellation_reason = 'test', cancelled_at = now() where id = $1`,
        [cancelled],
      );
      await expectError(book(actor, cancelled), "SESSION_CANCELLED");

      const tooFar = await createSession(w.activityId, tashkent("2024-03-18 10:01")); // > 7 days ahead
      await expectError(book(actor, tooFar), "BOOKING_WINDOW_EXCEEDED");
      const lastDay = await createSession(w.activityId, tashkent("2024-03-18 10:00")); // exactly 7 days
      expect((await book(actor, lastDay)).booking_state).toBe("confirmed");

      // Venue visibility is checked before plan eligibility.
      const hidden = await createVenue(w.orgId, { publication: "unpublished" });
      const hiddenSession = await createSession(await createActivity(hidden), tashkent("2024-03-12 12:00"));
      await expectError(book(actor, hiddenSession), "SESSION_NOT_BOOKABLE");

      const suspendedVenue = await createVenue(w.orgId, { operational: "suspended" });
      const suspendedSession = await createSession(await createActivity(suspendedVenue), tashkent("2024-03-12 12:00"));
      await expectError(book(actor, suspendedSession), "SESSION_NOT_BOOKABLE");

      await expectError(book(actor, randomUUID()), "SESSION_NOT_FOUND");
    });

    it("rejects sessions of venues whose organization is suspended", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      await sql(`update public.organizations set status = 'suspended', status_reason = 'test' where id = $1`, [w.orgId]);
      await expectError(book(await Actor.member(w.memberId, now), sessionId), "SESSION_NOT_BOOKABLE");
    });
  });

  describe("idempotency and duplicates", () => {
    it("returns the original booking for a repeated idempotency key", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      const actor = await Actor.member(w.memberId, now);
      const key = randomUUID();
      const first = await book(actor, sessionId, key);
      const second = await book(actor, sessionId, key);
      expect(second.booking_id).toBe(first.booking_id);
      expect(second.replayed).toBe(true);
      expect((await sessionRow(sessionId)).occupied_count).toBe(1);
    });

    it("rejects reuse of an idempotency key for a different session", async () => {
      const w = await bookableWorld(now, { dailyVisitLimit: 2 });
      const a = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      const b = await createSession(w.activityId, tashkent("2024-03-13 18:00"));
      const actor = await Actor.member(w.memberId, now);
      const key = randomUUID();
      await book(actor, a, key);
      await expectError(book(actor, b, key), "IDEMPOTENCY_KEY_REUSED");
    });

    it("creates exactly one reservation for concurrent requests with the same key", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      const key = randomUUID();
      const actors = await Promise.all(Array.from({ length: 10 }, () => Actor.member(w.memberId, now)));
      const { ok, errors } = await settle(actors.map((a) => () => book(a, sessionId, key)));
      expect(errors).toEqual([]);
      expect(new Set(ok.map((r) => r.booking_id)).size).toBe(1);
      expect(ok.filter((r) => !r.replayed)).toHaveLength(1);
      const rows = await sql(`select id from public.bookings where user_id = $1`, [w.memberId]);
      expect(rows).toHaveLength(1);
    });

    it("rejects a second live reservation for the same session", async () => {
      const w = await bookableWorld(now, { dailyVisitLimit: 3 });
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"));
      const actor = await Actor.member(w.memberId, now);
      await book(actor, sessionId);
      await expectError(book(actor, sessionId), "ALREADY_BOOKED");
    });
  });

  describe("limits", () => {
    it("rejects overlapping reservations but allows back-to-back sessions (half-open intervals)", async () => {
      const w = await bookableWorld(now, { dailyVisitLimit: 3 });
      const actor = await Actor.member(w.memberId, now);
      const first = await createSession(w.activityId, tashkent("2024-03-12 18:00")); // 18:00-19:00
      const overlapping = await createSession(w.activityId, tashkent("2024-03-12 18:30"));
      const adjacent = await createSession(w.activityId, tashkent("2024-03-12 19:00")); // starts when first ends
      await book(actor, first);
      await expectError(book(actor, overlapping), "TIME_CONFLICT");
      expect((await book(actor, adjacent)).booking_state).toBe("confirmed");
    });

    it("counts the daily limit per local calendar day in Asia/Tashkent", async () => {
      const w = await bookableWorld(now);
      const actor = await Actor.member(w.memberId, now);
      // 23:30 local on the 12th is 18:30 UTC on the 12th; 00:15 local on the 13th is 19:15 UTC on the 12th.
      const lateEvening = await createSession(w.activityId, tashkent("2024-03-12 23:00"));
      const afterMidnight = await createSession(w.activityId, tashkent("2024-03-13 00:15"));
      // 22:00 local on the 13th is on the same local date as 00:15 but a different UTC date.
      const sameLocalDay = await createSession(w.activityId, tashkent("2024-03-13 22:00"));

      expect((await book(actor, lateEvening)).booking_state).toBe("confirmed");
      expect((await book(actor, afterMidnight)).booking_state).toBe("confirmed");
      await expectError(book(actor, sameLocalDay), "DAILY_LIMIT_REACHED");

      const dates = await sql<{ local_date: string }>(
        `select local_date::text from public.bookings where user_id = $1 order by session_starts_at`,
        [w.memberId],
      );
      expect(dates.map((d) => d.local_date)).toEqual(["2024-03-12", "2024-03-13"]);
    });

    it("limits future reservations", async () => {
      const w = await bookableWorld(now, { maxFutureBookings: 3 });
      const actor = await Actor.member(w.memberId, now);
      for (const day of ["12", "13", "14"]) {
        await book(actor, await createSession(w.activityId, tashkent(`2024-03-${day} 18:00`)));
      }
      await expectError(
        book(actor, await createSession(w.activityId, tashkent("2024-03-15 18:00"))),
        "FUTURE_BOOKING_LIMIT_REACHED",
      );
    });

    it("counts future reservations toward the visit allowance", async () => {
      const w = await bookableWorld(now, { visitAllowance: 2, maxFutureBookings: 5 });
      const actor = await Actor.member(w.memberId, now);
      const first = await book(actor, await createSession(w.activityId, tashkent("2024-03-12 18:00")));
      await book(actor, await createSession(w.activityId, tashkent("2024-03-13 18:00")));
      const third = await createSession(w.activityId, tashkent("2024-03-14 18:00"));
      await expectError(book(actor, third), "VISIT_LIMIT_REACHED");

      // A timely cancellation releases the reserved visit.
      await actor.rpc("cancel_booking", { p_booking_id: first.booking_id });
      expect((await book(actor, third)).booking_state).toBe("confirmed");
    });

    it("rejects bookings when the session is full", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"), { capacity: 1 });
      await book(await Actor.member(w.memberId, now), sessionId);
      const other = await addMember(w.planVersionId, now);
      await expectError(book(await Actor.member(other.memberId, now), sessionId), "SESSION_FULL");
    });
  });

  describe("concurrency", () => {
    it("gives exactly one of twenty simultaneous requests the last place", async () => {
      const w = await bookableWorld(now);
      const sessionId = await createSession(w.activityId, tashkent("2024-03-12 18:00"), { capacity: 3 });
      // Two places already taken; one remains.
      for (let i = 0; i < 2; i++) {
        const m = await addMember(w.planVersionId, now);
        await book(await Actor.member(m.memberId, now), sessionId);
      }
      const members = await Promise.all(Array.from({ length: 20 }, () => addMember(w.planVersionId, now)));
      const actors = await Promise.all(members.map((m) => Actor.member(m.memberId, now)));

      const { ok, errors } = await settle(actors.map((actor) => () => book(actor, sessionId)));

      expect(ok).toHaveLength(1);
      expect(errors).toHaveLength(19);
      expect(new Set(errors)).toEqual(new Set(["SESSION_FULL"]));
      const session = await sessionRow(sessionId);
      expect(session.occupied_count).toBe(3);
      const live = await sql(`select count(*)::int as n from public.bookings where session_id = $1 and state = 'confirmed'`, [
        sessionId,
      ]);
      expect(live[0]!.n).toBe(3);
    });

    it("never lets one member exceed the daily limit with simultaneous requests", async () => {
      const w = await bookableWorld(now);
      const sessions = await Promise.all(
        ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"].map((t) =>
          createSession(w.activityId, tashkent(`2024-03-12 ${t}`)),
        ),
      );
      const actors = await Promise.all(sessions.map(() => Actor.member(w.memberId, now)));
      const { ok, errors } = await settle(sessions.map((s, i) => () => book(actors[i]!, s)));
      expect(ok).toHaveLength(1);
      expect(new Set(errors)).toEqual(new Set(["DAILY_LIMIT_REACHED"]));
    });

    it("never lets one member exceed the future-booking limit with simultaneous requests", async () => {
      const w = await bookableWorld(now, { maxFutureBookings: 3, visitAllowance: 20 });
      const sessions = await Promise.all(
        ["12", "13", "14", "15", "16", "17"].map((d) => createSession(w.activityId, tashkent(`2024-03-${d} 18:00`))),
      );
      const actors = await Promise.all(sessions.map(() => Actor.member(w.memberId, now)));
      const { ok, errors } = await settle(sessions.map((s, i) => () => book(actors[i]!, s)));
      expect(ok).toHaveLength(3);
      expect(new Set(errors)).toEqual(new Set(["FUTURE_BOOKING_LIMIT_REACHED"]));
    });

    it("never lets one member exceed the visit allowance with simultaneous requests", async () => {
      const w = await bookableWorld(now, { maxFutureBookings: 10, visitAllowance: 2 });
      const sessions = await Promise.all(
        ["12", "13", "14", "15", "16", "17"].map((d) => createSession(w.activityId, tashkent(`2024-03-${d} 18:00`))),
      );
      const actors = await Promise.all(sessions.map(() => Actor.member(w.memberId, now)));
      const { ok, errors } = await settle(sessions.map((s, i) => () => book(actors[i]!, s)));
      expect(ok).toHaveLength(2);
      expect(new Set(errors)).toEqual(new Set(["VISIT_LIMIT_REACHED"]));
      expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 2 });
    });
  });
});
