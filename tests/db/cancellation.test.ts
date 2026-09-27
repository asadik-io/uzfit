import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Actor,
  addMember,
  addMinutes,
  addStaff,
  bookableWorld,
  closeAll,
  createOrg,
  createSession,
  createUser,
  expectError,
  membershipUsage,
  sessionRow,
  settle,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

type BookingResult = { booking_id: string; booking_state: string };
type CancelResult = { booking_id: string; booking_state: string; already_cancelled: boolean };

function book(actor: Actor, sessionId: string) {
  return actor.rpcOne<BookingResult>("create_booking", { p_session_id: sessionId, p_idempotency_key: randomUUID() });
}

function cancel(actor: Actor, bookingId: string, acceptLate = false) {
  return actor.rpcOne<CancelResult>("cancel_booking", { p_booking_id: bookingId, p_accept_late: acceptLate });
}

async function bookingState(id: string): Promise<string> {
  const [row] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [id]);
  return row!.state;
}

describe("member cancellation", () => {
  const now = tashkent("2024-04-08 10:00");
  const start = tashkent("2024-04-09 18:00");
  const deadline = tashkent("2024-04-09 16:00");

  it("is free exactly at the deadline and releases the visit, place, and day slot", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, start);
    const actor = await Actor.member(w.memberId, now);
    const { booking_id } = await book(actor, sessionId);

    await actor.setNow(deadline);
    const result = await cancel(actor, booking_id);
    expect(result.booking_state).toBe("cancelled_on_time");
    expect(result.already_cancelled).toBe(false);

    expect((await sessionRow(sessionId)).occupied_count).toBe(0);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 0 });
    // The local day slot is free again.
    const later = await createSession(w.activityId, tashkent("2024-04-09 20:00"));
    expect((await book(actor, later)).booking_state).toBe("confirmed");
  });

  it("is late one microsecond after the deadline, and only with explicit acknowledgement", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, start);
    const actor = await Actor.member(w.memberId, now);
    const { booking_id } = await book(actor, sessionId);

    await actor.setNow("2024-04-09 16:00:00.000001+05");
    await expectError(cancel(actor, booking_id, false), "LATE_CANCELLATION_UNCONFIRMED");
    expect(await bookingState(booking_id)).toBe("confirmed");

    const result = await cancel(actor, booking_id, true);
    expect(result.booking_state).toBe("cancelled_late");
    // The place is released but the visit is consumed and the day slot stays occupied.
    expect((await sessionRow(sessionId)).occupied_count).toBe(0);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 0 });
    const later = await createSession(w.activityId, tashkent("2024-04-09 20:00"));
    await expectError(book(actor, later), "DAILY_LIMIT_REACHED");
  });

  it("closes when the session starts", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, start);
    const actor = await Actor.member(w.memberId, now);
    const { booking_id } = await book(actor, sessionId);
    await actor.setNow(start);
    await expectError(cancel(actor, booking_id, true), "CANCELLATION_CLOSED");
    await actor.setNow(addMinutes(start, -0.001));
    expect((await cancel(actor, booking_id, true)).booking_state).toBe("cancelled_late");
  });

  it("refuses checked-in reservations and is idempotent for repeated requests", async () => {
    const w = await bookableWorld(now, { dailyVisitLimit: 2 });
    const actor = await Actor.member(w.memberId, now);
    const checkedIn = await book(actor, await createSession(w.activityId, start));
    await sql(`update public.bookings set state = 'checked_in', checked_in_at = now() where id = $1`, [
      checkedIn.booking_id,
    ]);
    await expectError(cancel(actor, checkedIn.booking_id), "ALREADY_CHECKED_IN");

    const other = await book(actor, await createSession(w.activityId, tashkent("2024-04-09 20:00")));
    const first = await cancel(actor, other.booking_id);
    const second = await cancel(actor, other.booking_id);
    expect(first.already_cancelled).toBe(false);
    expect(second).toMatchObject({ booking_state: "cancelled_on_time", already_cancelled: true });
  });

  it("never lets a member cancel someone else's reservation", async () => {
    const w = await bookableWorld(now);
    const { booking_id } = await book(await Actor.member(w.memberId, now), await createSession(w.activityId, start));
    const intruder = await Actor.member(await createUser(), now);
    await expectError(cancel(intruder, booking_id, true), "BOOKING_NOT_FOUND");
    expect(await bookingState(booking_id)).toBe("confirmed");
  });
});

describe("venue cancellation", () => {
  const now = tashkent("2024-04-15 10:00");
  const start = tashkent("2024-04-16 18:00");

  async function setup() {
    const w = await bookableWorld(now);
    const manager = await createUser("Manager");
    await addStaff(w.orgId, manager, "manager");
    const sessionId = await createSession(w.activityId, start, { capacity: 5 });
    return { ...w, manager, sessionId };
  }

  it("releases confirmed reservations, preserves attendance, and notifies members", async () => {
    const w = await setup();
    const confirmed = await book(await Actor.member(w.memberId, now), w.sessionId);
    const attendee = await addMember(w.planVersionId, now);
    const attended = await book(await Actor.member(attendee.memberId, now), w.sessionId);
    await sql(`update public.bookings set state = 'checked_in', checked_in_at = now() where id = $1`, [
      attended.booking_id,
    ]);

    const manager = await Actor.member(w.manager, addMinutes(start, 10));
    const [released] = await manager.rpc<{ cancel_session: number }>("cancel_session", {
      p_session_id: w.sessionId,
      p_reason: "Coach is ill",
    });
    expect(released!.cancel_session).toBe(1);

    expect(await bookingState(confirmed.booking_id)).toBe("venue_cancelled");
    expect(await bookingState(attended.booking_id)).toBe("checked_in");
    const session = await sessionRow(w.sessionId);
    expect(session).toMatchObject({ status: "cancelled", occupied_count: 1 });
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 0 });
    expect(await membershipUsage(attendee.membershipId)).toEqual({ consumed: 1, reserved: 0 });

    const notices = await sql(
      `select message_key, params ->> 'reason' as reason from public.notifications where user_id = $1`,
      [w.memberId],
    );
    expect(notices).toContainEqual({ message_key: "booking_venue_cancelled", reason: "Coach is ill" });

    // Idempotent.
    const [again] = await manager.rpc<{ cancel_session: number }>("cancel_session", {
      p_session_id: w.sessionId,
      p_reason: "Coach is ill",
    });
    expect(again!.cancel_session).toBe(0);
  });

  it("requires a reason, the manager role of the owning organization, and a session that has not ended", async () => {
    const w = await setup();
    const manager = await Actor.member(w.manager, now);
    await expectError(manager.rpc("cancel_session", { p_session_id: w.sessionId, p_reason: " a " }), "REASON_REQUIRED");

    const receptionist = await createUser();
    await addStaff(w.orgId, receptionist, "receptionist");
    await expectError(
      (await Actor.member(receptionist, now)).rpc("cancel_session", { p_session_id: w.sessionId, p_reason: "Closed" }),
      "FORBIDDEN",
    );

    const otherManager = await createUser();
    await addStaff(await createOrg("Other org"), otherManager, "manager");
    await expectError(
      (await Actor.member(otherManager, now)).rpc("cancel_session", { p_session_id: w.sessionId, p_reason: "Closed" }),
      "FORBIDDEN",
    );

    await manager.setNow(addMinutes(start, 60));
    await expectError(
      manager.rpc("cancel_session", { p_session_id: w.sessionId, p_reason: "Too late" }),
      "SESSION_ENDED",
    );
    expect((await sessionRow(w.sessionId)).status).toBe("scheduled");
  });

  it("leaves no confirmed reservation behind when bookings race the cancellation", async () => {
    const w = await setup();
    await sql(`update public.sessions set capacity = 30 where id = $1`, [w.sessionId]);
    const members = await Promise.all(Array.from({ length: 12 }, () => addMember(w.planVersionId, now)));
    const actors = await Promise.all(members.map((m) => Actor.member(m.memberId, now)));
    const manager = await Actor.member(w.manager, now);

    const calls: Array<() => Promise<unknown>> = actors.map((a) => () => book(a, w.sessionId));
    calls.splice(6, 0, () => manager.rpc("cancel_session", { p_session_id: w.sessionId, p_reason: "Hall flooded" }));
    const { errors } = await settle(calls);

    expect(errors.every((e) => e === "SESSION_CANCELLED")).toBe(true);
    const live = await sql(
      `select count(*)::int as n from public.bookings where session_id = $1 and state in ('confirmed', 'checked_in')`,
      [w.sessionId],
    );
    expect(live[0]!.n).toBe(0);
    expect(await sessionRow(w.sessionId)).toMatchObject({ status: "cancelled", occupied_count: 0 });
  });
});

describe("no-show finalization", () => {
  const now = tashkent("2024-04-22 10:00");
  const start = tashkent("2024-04-23 18:00");
  const end = addMinutes(start, 60);

  it("turns confirmed reservations into no-shows only after the session ends, exactly once", async () => {
    const w = await bookableWorld(now);
    const sessionId = await createSession(w.activityId, start);
    const { booking_id } = await book(await Actor.member(w.memberId, now), sessionId);

    const job = await Actor.service(addMinutes(end, -0.001));
    await job.rpc("reconcile_no_shows", { p_limit: 500 });
    expect(await bookingState(booking_id)).toBe("confirmed");

    await job.setNow(end);
    await job.rpc("reconcile_no_shows", { p_limit: 500 });
    expect(await bookingState(booking_id)).toBe("no_show");
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 0 });
    expect((await sessionRow(sessionId)).occupied_count).toBe(0);

    await job.rpc("reconcile_no_shows", { p_limit: 500 });
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 0 });
    const notices = await sql(
      `select count(*)::int as n from public.notifications where user_id = $1 and message_key = 'no_show_recorded'`,
      [w.memberId],
    );
    expect(notices[0]!.n).toBe(1);
  });

  it("is not callable by members", async () => {
    const member = await Actor.member(await createUser(), now);
    await expectError(member.rpc("reconcile_no_shows", { p_limit: 1 }), "42501");
  });
});

describe("allowance accounting across every transition", () => {
  const now = tashkent("2024-04-29 08:00");

  it("applies each transition's visit and capacity effect exactly once", async () => {
    const w = await bookableWorld(now, { visitAllowance: 10, maxFutureBookings: 10 });
    const manager = await createUser();
    await addStaff(w.orgId, manager, "manager");
    const actor = await Actor.member(w.memberId, now);

    const sessions = {
      timely: await createSession(w.activityId, tashkent("2024-04-30 18:00")),
      late: await createSession(w.activityId, tashkent("2024-05-01 18:00")),
      venue: await createSession(w.activityId, tashkent("2024-05-02 18:00")),
      noShow: await createSession(w.activityId, tashkent("2024-05-03 18:00")),
    };
    const bookings: Record<string, string> = {};
    for (const [name, sessionId] of Object.entries(sessions)) {
      bookings[name] = (await book(actor, sessionId)).booking_id;
    }
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 4 });

    await cancel(actor, bookings.timely!);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 0, reserved: 3 });

    await actor.setNow(tashkent("2024-05-01 17:00"));
    await cancel(actor, bookings.late!, true);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 2 });

    await (
      await Actor.member(manager, now)
    ).rpc("cancel_session", { p_session_id: sessions.venue, p_reason: "Closed" });
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 1 });

    const job = await Actor.service(tashkent("2024-05-03 19:00"));
    await job.rpc("reconcile_no_shows", { p_limit: 1000 });
    await job.rpc("reconcile_no_shows", { p_limit: 1000 });
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 2, reserved: 0 });

    for (const sessionId of Object.values(sessions)) {
      expect((await sessionRow(sessionId)).occupied_count).toBe(0);
    }
    const drift = await (await Actor.service()).rpc("session_occupancy_drift");
    expect(drift.filter((d) => Object.values(sessions).includes(d.session_id as string))).toEqual([]);
  });
});
