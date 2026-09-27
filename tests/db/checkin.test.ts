import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  Actor,
  addMinutes,
  addStaff,
  bookableWorld,
  closeAll,
  createActivity,
  createOrg,
  createSession,
  createUser,
  createVenue,
  expectError,
  membershipUsage,
  settle,
  sql,
  tashkent,
} from "./support";

afterAll(closeAll);

type Token = { token: string; expires_at: Date };
type Redeem = {
  ok: boolean;
  error_code: string | null;
  booking_id: string | null;
  member_display_name: string | null;
  checked_in_at: Date | null;
};

const now = tashkent("2024-05-06 09:00");
const start = tashkent("2024-05-06 18:00");

async function setup() {
  const w = await bookableWorld(now);
  const sessionId = await createSession(w.activityId, start);
  const member = await Actor.member(w.memberId, now);
  const { booking_id: bookingId } = await member.rpcOne<{ booking_id: string }>("create_booking", {
    p_session_id: sessionId,
    p_idempotency_key: randomUUID(),
  });
  const receptionist = await createUser("Reception");
  await addStaff(w.orgId, receptionist, "receptionist");
  return { ...w, sessionId, bookingId, member, receptionist };
}

function issue(actor: Actor, bookingId: string) {
  return actor.rpcOne<Token>("issue_checkin_token", { p_booking_id: bookingId });
}

function redeem(actor: Actor, token: string, venueId: string) {
  return actor.rpcOne<Redeem>("redeem_checkin_token", { p_token: token, p_venue_id: venueId });
}

describe("check-in token issuance", () => {
  it("opens 15 minutes before the start and closes at min(start + 30 minutes, end)", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -15.001));
    await expectError(issue(w.member, w.bookingId), "OUTSIDE_CHECKIN_WINDOW");

    await w.member.setNow(addMinutes(start, -15));
    const token = await issue(w.member, w.bookingId);
    expect(token.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.expires_at.toISOString()).toBe(addMinutes(start, -14).toISOString());

    await w.member.setNow(addMinutes(start, 29.999));
    await issue(w.member, w.bookingId);
    await w.member.setNow(addMinutes(start, 30));
    await expectError(issue(w.member, w.bookingId), "OUTSIDE_CHECKIN_WINDOW");
  });

  it("stores only a SHA-256 hash and invalidates earlier unused tokens on reissue", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -5));
    const first = await issue(w.member, w.bookingId);
    const second = await issue(w.member, w.bookingId);

    const rows = await sql<{ hash: string; revoked: boolean }>(
      `select encode(token_hash, 'hex') as hash, revoked_at is not null as revoked
         from public.checkin_tokens where booking_id = $1 order by created_at`,
      [w.bookingId],
    );
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    expect(rows).toEqual([
      { hash: sha(first.token), revoked: true },
      { hash: sha(second.token), revoked: false },
    ]);
    const stored = await sql(`select 1 from public.checkin_tokens where encode(token_hash, 'escape') like $1`, [
      `%${first.token}%`,
    ]);
    expect(stored).toHaveLength(0);

    const staff = await Actor.member(w.receptionist, addMinutes(start, -4.5));
    expect((await redeem(staff, first.token, w.venueId)).error_code).toBe("TOKEN_INVALID");
    expect((await redeem(staff, second.token, w.venueId)).ok).toBe(true);
  });

  it("is only available to the booking owner, and never exposes tokens to members or staff", async () => {
    const w = await setup();
    const other = await Actor.member(await createUser(), addMinutes(start, -5));
    await expectError(issue(other, w.bookingId), "BOOKING_NOT_FOUND");
    await expectError(w.member.query(`select * from public.checkin_tokens`), "42501");
    const staff = await Actor.member(w.receptionist);
    await expectError(staff.query(`select * from public.checkin_tokens`), "42501");
  });
});

describe("check-in redemption", () => {
  it("checks in atomically: token used, booking checked in, one attendance record, visit consumed", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -10));
    const { token } = await issue(w.member, w.bookingId);
    const staff = await Actor.member(w.receptionist, addMinutes(start, -9.5));

    const result = await redeem(staff, `UZFIT1:${token}`, w.venueId);
    expect(result).toMatchObject({
      ok: true,
      error_code: null,
      booking_id: w.bookingId,
      member_display_name: "Test Member",
    });

    const [booking] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [w.bookingId]);
    expect(booking!.state).toBe("checked_in");
    const checkins = await sql<{ verified_by: string }>(
      `select verified_by from public.checkins where booking_id = $1`,
      [w.bookingId],
    );
    expect(checkins).toEqual([{ verified_by: w.receptionist }]);
    expect(await membershipUsage(w.membershipId)).toEqual({ consumed: 1, reserved: 0 });

    // Replay fails safely.
    expect((await redeem(staff, token, w.venueId)).error_code).toBe("TOKEN_ALREADY_USED");
    expect(await sql(`select 1 from public.checkins where booking_id = $1`, [w.bookingId])).toHaveLength(1);
  });

  it("rejects expired tokens", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -10));
    const { token } = await issue(w.member, w.bookingId);
    const staff = await Actor.member(w.receptionist, addMinutes(start, -9));
    await staff.setNow(addMinutes(start, -9)); // issued at -10:00, valid for 60 s
    expect((await redeem(staff, token, w.venueId)).error_code).toBe("TOKEN_EXPIRED");
    const [booking] = await sql<{ state: string }>(`select state from public.bookings where id = $1`, [w.bookingId]);
    expect(booking!.state).toBe("confirmed");
  });

  it("rejects tokens for another venue, staff of another organization, members, and anonymous scanners", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -5));
    const { token } = await issue(w.member, w.bookingId);
    const at = addMinutes(start, -4.5);

    // Same organization, different venue: the scanner operates for its own venue.
    const sibling = await createVenue(w.orgId);
    await createActivity(sibling);
    const staff = await Actor.member(w.receptionist, at);
    expect((await redeem(staff, token, sibling)).error_code).toBe("WRONG_VENUE");

    // Staff of an unrelated organization, scanning at their venue or naming ours.
    const otherOrg = await createOrg("Unrelated");
    const otherVenue = await createVenue(otherOrg);
    const outsider = await createUser();
    await addStaff(otherOrg, outsider, "manager");
    const outsiderActor = await Actor.member(outsider, at);
    expect((await redeem(outsiderActor, token, otherVenue)).error_code).toBe("WRONG_VENUE");
    expect((await redeem(outsiderActor, token, w.venueId)).error_code).toBe("FORBIDDEN");

    // A member without a staff role.
    expect((await redeem(await Actor.member(await createUser(), at), token, w.venueId)).error_code).toBe("FORBIDDEN");
    // Anonymous callers cannot execute the function at all.
    await expectError(redeem(await Actor.anon(at), token, w.venueId), "42501");

    // Garbage input.
    expect((await redeem(staff, "not-a-token", w.venueId)).error_code).toBe("TOKEN_INVALID");
    expect((await redeem(staff, "A".repeat(43), w.venueId)).error_code).toBe("TOKEN_INVALID");

    // The original token still works for the right venue.
    expect((await redeem(staff, token, w.venueId)).ok).toBe(true);
  });

  it("rejects redemption outside the check-in window and for cancelled reservations", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, 29.5));
    const { token } = await issue(w.member, w.bookingId);
    const staff = await Actor.member(w.receptionist, addMinutes(start, 30));
    expect((await redeem(staff, token, w.venueId)).error_code).toBe("OUTSIDE_CHECKIN_WINDOW");

    const w2 = await setup();
    await w2.member.setNow(addMinutes(start, -10));
    const second = await issue(w2.member, w2.bookingId);
    await sql(
      `update public.bookings set state = 'venue_cancelled', cancelled_at = now(), cancellation_source = 'venue'
        where id = $1`,
      [w2.bookingId],
    );
    const staff2 = await Actor.member(w2.receptionist, addMinutes(start, -9.5));
    expect((await redeem(staff2, second.token, w2.venueId)).error_code).toBe("BOOKING_NOT_ACTIVE");
  });

  it("rejects redemption when the membership was revoked after booking", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -10));
    const { token } = await issue(w.member, w.bookingId);
    await sql(
      `update public.memberships set status = 'revoked', revoked_at = now(), revoke_reason = 'test' where id = $1`,
      [w.membershipId],
    );
    const staff = await Actor.member(w.receptionist, addMinutes(start, -9.5));
    expect((await redeem(staff, token, w.venueId)).error_code).toBe("MEMBERSHIP_REQUIRED");
  });

  it("checks in exactly once when two scanners redeem the same token simultaneously", async () => {
    const w = await setup();
    await w.member.setNow(addMinutes(start, -10));
    const { token } = await issue(w.member, w.bookingId);
    const second = await createUser();
    await addStaff(w.orgId, second, "manager");
    const scanners = await Promise.all([
      Actor.member(w.receptionist, addMinutes(start, -9.8)),
      Actor.member(second, addMinutes(start, -9.8)),
      Actor.member(w.receptionist, addMinutes(start, -9.8)),
    ]);
    const { ok } = await settle(scanners.map((s) => () => redeem(s, token, w.venueId)));
    expect(ok.filter((r) => r.ok)).toHaveLength(1);
    expect(ok.filter((r) => !r.ok).map((r) => r.error_code)).toEqual(["TOKEN_ALREADY_USED", "TOKEN_ALREADY_USED"]);
    expect(await sql(`select 1 from public.checkins where booking_id = $1`, [w.bookingId])).toHaveLength(1);
  });

  it("counts failed attempts toward the persistent redemption rate limit", async () => {
    const w = await setup();
    const staff = await Actor.member(w.receptionist, addMinutes(start, -5));
    // Fixed one-minute windows: even if a window boundary passes mid-loop, the limit (120 per
    // window) is reached again before 241 attempts.
    const results: Array<string | null> = [];
    for (let i = 0; i < 241 && !results.includes("RATE_LIMITED"); i++) {
      results.push((await redeem(staff, `bad-${i}`, w.venueId)).error_code);
    }
    const firstLimited = results.indexOf("RATE_LIMITED");
    expect(firstLimited).toBeGreaterThanOrEqual(120);
    expect(results.slice(0, firstLimited).every((c) => c === "TOKEN_INVALID")).toBe(true);
  });
});
