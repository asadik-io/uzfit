/**
 * Creates reproducible DEMO accounts and fixtures on a LOCAL/DEV Supabase database:
 *   - platform admin, partner staff for two unrelated organizations, and members with active,
 *     expired, revoked, and no memberships;
 *   - upcoming bookings (made through the real create_booking function), past attendance,
 *     a no-show, and a full session;
 *   - generated demo artwork uploaded to the venue-media bucket.
 *
 * Usage: pnpm setup:demo            (reads .env.local)
 * Passwords: DEMO_PASSWORD, or a random password printed once and written to
 * .demo-credentials.local.json (git-ignored). Never run against production: the script refuses
 * non-local Supabase URLs unless ALLOW_DEMO_SETUP=true, and always refuses production envs.
 * Safe to re-run: existing users get the (new) password; existing fixtures are kept.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../src/lib/supabase/database.types";
import { venueArtSvg } from "./lib/demo-art";

type Admin = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function fatal(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!url || !secretKey || !publishableKey) {
  fatal("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (see .env.example).");
}
if (process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production") {
  fatal("Refusing to create demo accounts in a production environment.");
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_DEMO_SETUP !== "true") {
  fatal(`Refusing to seed demo accounts on ${host}. Set ALLOW_DEMO_SETUP=true only for a disposable staging project.`);
}

const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(9).toString("base64url")}7`;
if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || password.length < 8) {
  fatal("DEMO_PASSWORD must have at least 8 characters with letters and digits.");
}

const admin: Admin = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ORG_A = "0a000000-0000-4000-8000-000000000001";
const ORG_B = "0a000000-0000-4000-8000-000000000002";
const ORG_C = "0a000000-0000-4000-8000-000000000003";
const PLAN = {
  startV1: "b2000000-0000-4000-8000-000000000001",
  startV2: "b2000000-0000-4000-8000-000000000002",
  active: "b2000000-0000-4000-8000-000000000003",
  max: "b2000000-0000-4000-8000-000000000004",
};

const USERS = [
  { key: "admin", email: "admin@uzfit.test", name: "Demo Admin", locale: "en" },
  { key: "partnerA", email: "partner.a.manager@uzfit.test", name: "Demo Manager A", locale: "uz" },
  { key: "receptionA", email: "partner.a.reception@uzfit.test", name: "Demo Reception A", locale: "uz" },
  { key: "partnerB", email: "partner.b.manager@uzfit.test", name: "Demo Manager B", locale: "ru" },
  { key: "partnerC", email: "partner.c.manager@uzfit.test", name: "Demo Manager C", locale: "ru" },
  { key: "member", email: "member@uzfit.test", name: "Dilnoza (demo)", locale: "uz" },
  { key: "memberNew", email: "member.new@uzfit.test", name: "Jasur (demo)", locale: "ru" },
  { key: "memberExpired", email: "member.expired@uzfit.test", name: "Malika (demo)", locale: "en" },
  { key: "memberRevoked", email: "member.revoked@uzfit.test", name: "Timur (demo)", locale: "uz" },
  { key: "filler1", email: "filler.1@uzfit.test", name: "Demo Filler 1", locale: "uz" },
  { key: "filler2", email: "filler.2@uzfit.test", name: "Demo Filler 2", locale: "uz" },
] as const;

type UserKey = (typeof USERS)[number]["key"];

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) {
    fatal(`${what}: ${result.error.message}`);
  }
  return result.data;
}

async function ensureUsers(): Promise<Record<UserKey, string>> {
  const existing = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      fatal(`listUsers: ${error.message}`);
    }
    for (const user of data.users) {
      if (user.email) {
        existing.set(user.email, user.id);
      }
    }
    if (data.users.length < 200) {
      break;
    }
  }
  const ids = {} as Record<UserKey, string>;
  for (const user of USERS) {
    const found = existing.get(user.email);
    if (found) {
      check(await admin.auth.admin.updateUserById(found, { password }), `update ${user.email}`);
      ids[user.key] = found;
      continue;
    }
    const created = check(
      await admin.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: user.name, locale: user.locale },
      }),
      `create ${user.email}`,
    );
    ids[user.key] = created.user!.id;
  }
  return ids;
}

async function ensureRoles(ids: Record<UserKey, string>) {
  check(await admin.from("platform_roles").upsert({ user_id: ids.admin, role: "admin" }), "admin role");
  const staff = [
    { organization_id: ORG_A, user_id: ids.partnerA, role: "manager" as const },
    { organization_id: ORG_A, user_id: ids.receptionA, role: "receptionist" as const },
    { organization_id: ORG_B, user_id: ids.partnerB, role: "manager" as const },
    { organization_id: ORG_C, user_id: ids.partnerC, role: "manager" as const },
  ];
  check(await admin.from("organization_members").upsert(staff), "organization members");
}

const DAY = 24 * 60 * 60 * 1000;

async function ensureMemberships(ids: Record<UserKey, string>) {
  const { data: present } = await admin.from("memberships").select("user_id").in("user_id", Object.values(ids));
  const has = new Set((present ?? []).map((m) => m.user_id));
  const now = Date.now();
  const rows: Database["public"]["Tables"]["memberships"]["Insert"][] = [];
  const grant = (user: string, planVersion: string, startOffsetDays: number, endOffsetDays: number) => ({
    user_id: user,
    plan_version_id: planVersion,
    starts_at: new Date(now + startOffsetDays * DAY).toISOString(),
    ends_at: new Date(now + endOffsetDays * DAY).toISOString(),
    source: "admin" as const,
    is_demo: true,
    grant_reason: "Demo fixture",
    // Bulk inserts use the union of keys, so every row sets every optional column explicitly.
    status: "active" as Database["public"]["Enums"]["membership_status"],
    revoked_at: null as string | null,
    revoke_reason: null as string | null,
  });
  if (!has.has(ids.member)) rows.push(grant(ids.member, PLAN.active, -5, 25));
  if (!has.has(ids.memberExpired)) rows.push(grant(ids.memberExpired, PLAN.startV1, -40, -10));
  if (!has.has(ids.filler1)) rows.push(grant(ids.filler1, PLAN.max, -1, 29));
  if (!has.has(ids.filler2)) rows.push(grant(ids.filler2, PLAN.max, -1, 29));
  if (!has.has(ids.memberRevoked)) {
    rows.push({
      ...grant(ids.memberRevoked, PLAN.startV2, -3, 27),
      status: "revoked",
      revoked_at: new Date(now - DAY).toISOString(),
      revoke_reason: "Demo fixture: revoked membership",
    });
  }
  if (rows.length) {
    check(await admin.from("memberships").insert(rows), "memberships");
  }
}

async function memberClient(email: string) {
  const client = createClient<Database>(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  check(await client.auth.signInWithPassword({ email, password }), `sign in ${email}`);
  return client;
}

async function upcomingSession(venueId: string, activityId: string | null, minHoursAhead: number) {
  let query = admin
    .from("sessions")
    .select("id, starts_at, activity_id")
    .eq("venue_id", venueId)
    .eq("status", "scheduled")
    .gt("starts_at", new Date(Date.now() + minHoursAhead * 60 * 60 * 1000).toISOString())
    .order("starts_at")
    .limit(1);
  if (activityId) {
    query = query.eq("activity_id", activityId);
  }
  const { data } = await query;
  return data?.[0] ?? null;
}

async function ensureBookings(ids: Record<UserKey, string>) {
  const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", ids.member);
  if (count && count > 0) {
    return "kept existing bookings";
  }
  // Upcoming bookings through the real transactional function (different local days).
  const member = await memberClient("member@uzfit.test");
  const targets = [
    { venue: "e1000000-0000-4000-8000-000000000001", hours: 20 },
    { venue: "e1000000-0000-4000-8000-000000000005", hours: 44 },
  ];
  for (const target of targets) {
    const session = await upcomingSession(target.venue, null, target.hours);
    if (session) {
      const { error } = await member.rpc("create_booking", {
        p_session_id: session.id,
        p_idempotency_key: randomUUID(),
      });
      if (error) console.warn(`  (booking skipped: ${error.message})`);
    }
  }

  // Past attendance history (fixtures written directly; the sessions are already over).
  const { data: membership } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", ids.member)
    .eq("status", "active")
    .order("starts_at", { ascending: false })
    .limit(1)
    .single();
  const { data: past } = await admin
    .from("sessions")
    .select("id, venue_id, starts_at, ends_at")
    .in("venue_id", ["e1000000-0000-4000-8000-000000000001", "e1000000-0000-4000-8000-000000000003"])
    .eq("status", "scheduled")
    .lt("ends_at", new Date().toISOString())
    .gt("starts_at", new Date(Date.now() - 4 * DAY).toISOString())
    .order("starts_at", { ascending: false });
  type PastSession = { id: string; venue_id: string; starts_at: string; ends_at: string };
  const perDay = new Map<string, PastSession>();
  for (const s of past ?? []) {
    const day = new Date(new Date(s.starts_at).getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!perDay.has(day)) perDay.set(day, s);
  }
  const history = [...perDay.entries()].slice(0, 3);
  for (const [index, [day, session]] of history.entries()) {
    const starts = new Date(session.starts_at);
    const state = index === 2 ? "no_show" : "checked_in";
    const inserted = check(
      await admin
        .from("bookings")
        .insert({
          user_id: ids.member,
          session_id: session.id,
          membership_id: membership!.id,
          venue_id: session.venue_id,
          state,
          local_date: day,
          session_starts_at: session.starts_at,
          session_ends_at: session.ends_at,
          cancellation_deadline: new Date(starts.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          checkin_opens_at: new Date(starts.getTime() - 15 * 60 * 1000).toISOString(),
          checkin_closes_at: new Date(starts.getTime() + 30 * 60 * 1000).toISOString(),
          policy_snapshot: { demo_fixture: true, free_cancellation_minutes: 120 },
          idempotency_key: randomUUID(),
          checked_in_at: state === "checked_in" ? new Date(starts.getTime() - 5 * 60 * 1000).toISOString() : null,
          finalized_at: state === "no_show" ? session.ends_at : null,
        })
        .select("id")
        .single(),
      "history booking",
    );
    if (state === "checked_in") {
      check(
        await admin.from("checkins").insert({
          booking_id: inserted.id,
          venue_id: session.venue_id,
          checked_in_at: new Date(starts.getTime() - 5 * 60 * 1000).toISOString(),
          verified_by: ids.receptionA,
        }),
        "history check-in",
      );
    }
  }

  // A full session: a small class tomorrow, filled by two demo members.
  const full = await upcomingSession("e1000000-0000-4000-8000-000000000004", "ac000000-0000-4000-8000-000000000007", 24);
  if (full) {
    check(await admin.from("sessions").update({ capacity: 2 }).eq("id", full.id), "full session capacity");
    for (const email of ["filler.1@uzfit.test", "filler.2@uzfit.test"]) {
      const client = await memberClient(email);
      const { error } = await client.rpc("create_booking", { p_session_id: full.id, p_idempotency_key: randomUUID() });
      if (error) console.warn(`  (filler booking skipped: ${error.message})`);
    }
  }
  return "created bookings";
}

async function ensureImages() {
  const { data: venues } = await admin
    .from("venues")
    .select("id, slug, venue_categories(categories(slug))")
    .eq("is_demo", true)
    .order("slug");
  const { data: existing } = await admin.from("venue_images").select("venue_id");
  const withImages = new Set((existing ?? []).map((row) => row.venue_id));
  let uploaded = 0;
  for (const [index, venue] of (venues ?? []).entries()) {
    if (withImages.has(venue.id)) continue;
    const categories = (venue.venue_categories ?? [])
      .map((vc) => (vc.categories as unknown as { slug: string } | null)?.slug)
      .filter((slug): slug is string => Boolean(slug));
    const images = [categories[0] ?? "gym", categories[1] ?? categories[0] ?? "functional"];
    for (const [imageIndex, category] of images.entries()) {
      const webp = await sharp(Buffer.from(venueArtSvg(category, index * 97 + imageIndex * 13 + 7)))
        .webp({ quality: 78 })
        .toBuffer();
      const path = `venues/${venue.id}/${randomUUID()}.webp`;
      check(
        await admin.storage.from("venue-media").upload(path, webp, { contentType: "image/webp", upsert: false }),
        `upload ${path}`,
      );
      check(
        await admin.from("venue_images").insert({
          venue_id: venue.id,
          storage_path: path,
          sort_order: imageIndex,
          alt: { uz: "Demo rasm", ru: "Демо-изображение", en: "Demo image" },
        }),
        "venue image row",
      );
      uploaded++;
    }
  }
  return uploaded;
}

async function main() {
  const { data: org, error } = await admin.from("organizations").select("id").eq("id", ORG_A).maybeSingle();
  if (error || !org) {
    fatal("Demo seed data not found. Run `pnpm db:reset` first (applies migrations and supabase/seed.sql).");
  }
  console.log("• Users");
  const ids = await ensureUsers();
  console.log("• Roles");
  await ensureRoles(ids);
  console.log("• Memberships");
  await ensureMemberships(ids);
  console.log("• Bookings:", await ensureBookings(ids));
  console.log("• Images uploaded:", await ensureImages());

  const credentials = USERS.map((u) => ({ role: u.key, email: u.email, password }));
  writeFileSync(".demo-credentials.local.json", `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  console.log("\nDemo accounts (all use the same password; also saved to .demo-credentials.local.json):");
  console.table(credentials.map(({ role, email }) => ({ role, email })));
  console.log(`Password: ${password}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => fatal(error instanceof Error ? error.message : String(error)));
