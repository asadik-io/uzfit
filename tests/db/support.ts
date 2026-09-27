/**
 * Database integration test support.
 *
 * Tests connect directly to the local Supabase Postgres. An `Actor` is a dedicated connection that
 * behaves like a PostgREST request: it switches to an API role (anon, authenticated,
 * service_role) and sets the same JWT claims GUC PostgREST sets, so RLS, grants, and auth.uid()
 * apply exactly as they do for real API calls. The business clock is pinned per connection with
 * `uzfit.fake_now` (honored only while private.settings.allow_fake_clock is true).
 *
 * Fixtures are written by the `postgres` connection (BYPASSRLS), which is how the tests set up
 * states that no API role can create directly.
 *
 * Test instants are deliberately in the past (2024) relative to real time, so maintenance jobs
 * run by tests never touch seeded demo data, whose dates are relative to the seed date.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect } from "vitest";

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const clients = new Set<pg.Client>();

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  clients.add(client);
  return client;
}

export async function closeAll(): Promise<void> {
  const all = [...clients];
  clients.clear();
  await Promise.all(all.map((c) => c.end().catch(() => undefined)));
  await closeFixtures();
}

let fixturePool: pg.Pool | null = null;

/** Privileged fixture pool (postgres role, bypasses RLS). */
function pool(): pg.Pool {
  if (!fixturePool) {
    fixturePool = new pg.Pool({ connectionString: DB_URL, max: 5 });
  }
  return fixturePool;
}

export async function closeFixtures(): Promise<void> {
  const current = fixturePool;
  fixturePool = null;
  await current?.end();
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export type ApiRole = "anon" | "authenticated" | "service_role";

export interface ActorOptions {
  userId?: string | null;
  role?: ApiRole;
  aal?: "aal1" | "aal2";
  now?: Date | string | null;
}

export class Actor {
  private constructor(
    readonly client: pg.Client,
    readonly userId: string | null,
    readonly role: ApiRole,
  ) {}

  static async as(options: ActorOptions = {}): Promise<Actor> {
    const role: ApiRole = options.role ?? (options.userId ? "authenticated" : "anon");
    const client = await connect();
    const claims: Record<string, unknown> = { role };
    if (options.userId) {
      claims.sub = options.userId;
      claims.aal = options.aal ?? "aal1";
    }
    await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await client.query(`set role ${role}`);
    const actor = new Actor(client, options.userId ?? null, role);
    if (options.now) {
      await actor.setNow(options.now);
    }
    return actor;
  }

  static member(userId: string, now?: Date | string): Promise<Actor> {
    return Actor.as({ userId, now });
  }

  static anon(now?: Date | string): Promise<Actor> {
    return Actor.as({ role: "anon", now });
  }

  static service(now?: Date | string): Promise<Actor> {
    return Actor.as({ role: "service_role", now });
  }

  async setNow(now: Date | string | null): Promise<void> {
    const value = now === null ? "" : typeof now === "string" ? now : now.toISOString();
    await this.client.query("select set_config('uzfit.fake_now', $1, false)", [value]);
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query<T>(text, params)).rows;
  }

  /** Calls a public function with named arguments, like supabase.rpc(). */
  async rpc<T extends pg.QueryResultRow = pg.QueryResultRow>(
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<T[]> {
    const keys = Object.keys(args);
    const call = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    const result = await this.client.query<T>(call, keys.map((k) => serialize(args[k])));
    return result.rows;
  }

  async rpcOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const rows = await this.rpc<T>(fn, args);
    expect(rows.length).toBe(1);
    return rows[0] as T;
  }

  async close(): Promise<void> {
    clients.delete(this.client);
    await this.client.end().catch(() => undefined);
  }
}

function serialize(value: unknown): unknown {
  if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/** Asserts a promise rejects with a UzFit domain error code (or another Postgres error code). */
export async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (!error) {
    throw new Error(`Expected error ${code}, but the call succeeded`);
  }
  const pgError = error as { message?: string; code?: string };
  const actual = pgError.code === "P0001" ? pgError.message : pgError.code;
  expect(actual, `unexpected error: ${pgError.message}`).toBe(code);
}

/** Runs calls concurrently and summarizes fulfilled results and rejection codes. */
export async function settle<T>(calls: Array<() => Promise<T>>) {
  const results = await Promise.allSettled(calls.map((call) => call()));
  const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === "fulfilled");
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => {
      const e = r.reason as { code?: string; message?: string };
      return e.code === "P0001" ? (e.message ?? "") : `${e.code}:${e.message}`;
    });
  return { ok: ok.map((r) => r.value), errors };
}

// ---------------------------------------------------------------------------
// Time helpers (Asia/Tashkent is UTC+05:00 without daylight saving time)
// ---------------------------------------------------------------------------

/** Parses a Tashkent wall-clock time like "2024-03-11 18:00". */
export function tashkent(local: string): Date {
  return new Date(`${local.replace(" ", "T")}:00+05:00`);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TASHKENT_DISTRICT = "d1000000-0000-4000-8000-000000000012";
const GYM_CATEGORY = "ca000000-0000-4000-8000-000000000001";

export async function createUser(displayName = "Test Member"): Promise<string> {
  const id = randomUUID();
  await sql(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(), now(), now())`,
    [id, `test-${id}@uzfit.test`, JSON.stringify({ display_name: displayName, locale: "uz" })],
  );
  return id;
}

export async function createOrg(name = "Test Org"): Promise<string> {
  const [row] = await sql<{ id: string }>(`insert into public.organizations (name) values ($1) returning id`, [name]);
  return row!.id;
}

export async function addStaff(orgId: string, userId: string, role: "manager" | "receptionist"): Promise<void> {
  await sql(`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)`, [
    orgId,
    userId,
    role,
  ]);
}

export async function makeAdmin(userId: string): Promise<void> {
  await sql(`insert into public.platform_roles (user_id, role) values ($1, 'admin')`, [userId]);
}

export async function createVenue(
  orgId: string,
  options: {
    publication?: "draft" | "published" | "unpublished";
    operational?: "active" | "suspended";
    timezone?: string;
    name?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await sql(
    `insert into public.venues (id, organization_id, slug, name, address, district_id, timezone,
                                publication_status, operational_status, published_at)
     values ($1, $2, $3, $4, '{"uz": "Test address"}', $5, $6, $7, $8, now())`,
    [
      id,
      orgId,
      `test-${id}`,
      JSON.stringify({ uz: options.name ?? `Test venue ${id.slice(0, 8)}` }),
      TASHKENT_DISTRICT,
      options.timezone ?? "Asia/Tashkent",
      options.publication ?? "published",
      options.operational ?? "active",
    ],
  );
  await sql(`insert into public.venue_categories (venue_id, category_id) values ($1, $2)`, [id, GYM_CATEGORY]);
  return id;
}

export async function createActivity(
  venueId: string,
  options: { durationMinutes?: number; capacity?: number } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.activities (venue_id, category_id, kind, title, duration_minutes, default_capacity)
     values ($1, $2, 'class', '{"uz": "Test class"}', $3, $4) returning id`,
    [venueId, GYM_CATEGORY, options.durationMinutes ?? 60, options.capacity ?? 10],
  );
  return row!.id;
}

export async function createSession(
  activityId: string,
  startsAt: Date,
  options: { durationMinutes?: number; capacity?: number } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.sessions (venue_id, activity_id, starts_at, ends_at, capacity)
     select a.venue_id, a.id, $2::timestamptz, $2::timestamptz + make_interval(mins => $3), $4
       from public.activities a where a.id = $1
     returning id`,
    [activityId, startsAt, options.durationMinutes ?? 60, options.capacity ?? 10],
  );
  return row!.id;
}

export interface PlanTerms {
  priceMinor?: number;
  durationDays?: number;
  visitAllowance?: number;
  dailyVisitLimit?: number;
  maxFutureBookings?: number;
  bookingWindowDays?: number;
  freeCancellationMinutes?: number;
  isDemo?: boolean;
}

export async function createPlanVersion(venueIds: string[], terms: PlanTerms = {}): Promise<string> {
  const planCode = `test-${randomUUID().slice(0, 12)}`;
  const [plan] = await sql<{ id: string }>(`insert into public.plans (code) values ($1) returning id`, [planCode]);
  const [pv] = await sql<{ id: string }>(
    `insert into public.plan_versions (plan_id, version, status, name, price_minor, duration_days, visit_allowance,
                                       daily_visit_limit, max_future_bookings, booking_window_days,
                                       free_cancellation_minutes, is_demo)
     values ($1, 1, 'draft', '{"uz": "Test plan"}', $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      plan!.id,
      terms.priceMinor ?? 29_900_000,
      terms.durationDays ?? 30,
      terms.visitAllowance ?? 8,
      terms.dailyVisitLimit ?? 1,
      terms.maxFutureBookings ?? 3,
      terms.bookingWindowDays ?? 7,
      terms.freeCancellationMinutes ?? 120,
      terms.isDemo ?? true,
    ],
  );
  for (const venueId of venueIds) {
    await sql(`insert into public.plan_version_venues (plan_version_id, venue_id) values ($1, $2)`, [pv!.id, venueId]);
  }
  await sql(`update public.plan_versions set status = 'published', published_at = now() where id = $1`, [pv!.id]);
  return pv!.id;
}

export async function createMembership(
  userId: string,
  planVersionId: string,
  startsAt: Date,
  endsAt: Date,
  options: { status?: "active" | "revoked" } = {},
): Promise<string> {
  const revoked = options.status === "revoked";
  const [row] = await sql<{ id: string }>(
    `insert into public.memberships (user_id, plan_version_id, starts_at, ends_at, status, source, grant_reason,
                                     revoked_at, revoke_reason)
     values ($1, $2, $3, $4, $5, 'admin', 'test fixture', $6, $7) returning id`,
    [userId, planVersionId, startsAt, endsAt, options.status ?? "active", revoked ? new Date() : null, revoked ? "test" : null],
  );
  return row!.id;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql(
    `insert into private.settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  await sql(`delete from private.settings where key = $1`, [key]);
}

export async function sessionRow(sessionId: string) {
  const [row] = await sql<{ capacity: number; occupied_count: number; status: string }>(
    `select capacity, occupied_count, status from public.sessions where id = $1`,
    [sessionId],
  );
  return row!;
}

export async function membershipUsage(membershipId: string) {
  const [row] = await sql<{ consumed: number; reserved: number }>(
    `select * from private.membership_usage($1)`,
    [membershipId],
  );
  return row!;
}

/**
 * A ready-to-book world: organization, published venue, activity, a published plan version that
 * includes the venue, and a member with an active membership around `now`.
 */
export async function bookableWorld(now: Date, terms: PlanTerms = {}) {
  const orgId = await createOrg();
  const venueId = await createVenue(orgId);
  const activityId = await createActivity(venueId);
  const planVersionId = await createPlanVersion([venueId], terms);
  const memberId = await createUser();
  const membershipId = await createMembership(
    memberId,
    planVersionId,
    addMinutes(now, -24 * 60),
    addMinutes(now, 29 * 24 * 60),
  );
  return { orgId, venueId, activityId, planVersionId, memberId, membershipId };
}

export async function addMember(planVersionId: string, now: Date): Promise<{ memberId: string; membershipId: string }> {
  const memberId = await createUser();
  const membershipId = await createMembership(
    memberId,
    planVersionId,
    addMinutes(now, -24 * 60),
    addMinutes(now, 29 * 24 * 60),
  );
  return { memberId, membershipId };
}
