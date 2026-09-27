import { existsSync, readFileSync } from "node:fs";
import { type Browser, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const TZ = "Asia/Tashkent";
export const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Password of the demo accounts created by `pnpm setup:demo` (DEMO_PASSWORD or the local credentials file). */
export function demoPassword(): string {
  if (process.env.DEMO_PASSWORD) {
    return process.env.DEMO_PASSWORD;
  }
  const file = ".demo-credentials.local.json";
  if (existsSync(file)) {
    const accounts = JSON.parse(readFileSync(file, "utf8")) as Array<{ password: string }>;
    if (accounts[0]?.password) {
      return accounts[0].password;
    }
  }
  throw new Error("Run `pnpm setup:demo` first, or set DEMO_PASSWORD for the demo accounts.");
}

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for end-to-end tests (see .env.example).`);
  }
  return value;
}

export function serviceClient() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@uzfit.test`;
}

/** A confirmed member account created directly through the Auth admin API. */
export async function createMember(displayName: string) {
  const email = uniqueEmail("e2e");
  const password = `E2e${Math.random().toString(36).slice(2, 10)}9x`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, locale: "en" },
  });
  if (error || !data.user) {
    throw error ?? new Error("createUser failed");
  }
  return { id: data.user.id, email, password, displayName };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/en\/explore/);
}

export async function signedInPage(browser: Browser, email: string, password: string, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await signIn(page, email, password);
  return page;
}

/** Local date in Tashkent, optionally shifted by whole days. */
export function tashkentDate(offsetDays = 0): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

export function tashkentTime(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(instant);
}

/**
 * Inserts a scheduled session at a published venue (test fixture; partners normally create
 * sessions through the dashboard). Either `startsInMinutes` or a Tashkent `date` + `time`.
 */
export async function createSession(options: {
  venueSlug: string;
  startsInMinutes?: number;
  date?: string;
  time?: string;
  durationMinutes?: number;
  capacity?: number;
}): Promise<{ id: string; venueId: string; startsAt: Date }> {
  return withDb(async (db) => {
    const { rows: venues } = await db.query<{ id: string; activity_id: string }>(
      `select v.id, a.id as activity_id from venues v join activities a on a.venue_id = v.id
        where v.slug = $1 and a.is_active order by a.created_at limit 1`,
      [options.venueSlug],
    );
    const venue = venues[0];
    if (!venue) {
      throw new Error(`No active activity at ${options.venueSlug}`);
    }
    const base =
      options.startsInMinutes !== undefined
        ? `date_trunc('minute', now()) + make_interval(mins => ${Math.round(options.startsInMinutes)})`
        : `($4::date + $5::time) at time zone 'Asia/Tashkent'`;
    const params: unknown[] = [venue.id, venue.activity_id, options.capacity ?? 8];
    if (options.startsInMinutes === undefined) {
      params.push(options.date, options.time);
    }
    // Earlier runs may already hold this start time for the activity (one scheduled session per
    // activity and start); move forward minute by minute until a free slot is found.
    let rows: Array<{ id: string; starts_at: Date }> = [];
    for (let shift = 0; shift < 30 && rows.length === 0; shift += 1) {
      const start = `(${base} + make_interval(mins => ${shift}))`;
      try {
        ({ rows } = await db.query<{ id: string; starts_at: Date }>(
          `insert into sessions (venue_id, activity_id, starts_at, ends_at, capacity)
           values ($1, $2, ${start}, ${start} + make_interval(mins => ${options.durationMinutes ?? 60}), $3)
           returning id, starts_at`,
          params,
        ));
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") {
          throw error;
        }
      }
    }
    const row = rows[0]!;
    return { id: row.id, venueId: venue.id, startsAt: new Date(row.starts_at) };
  });
}

/** Latest email to an address from the local Mailpit inbox (polls until it arrives). */
export async function latestEmailHtml(to: string, subjectPattern?: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await search.json()) as { messages?: Array<{ ID: string; Subject: string }> };
    const message = body.messages?.find((m) => !subjectPattern || subjectPattern.test(m.Subject));
    if (message) {
      const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
      return detail.HTML;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email for ${to}`);
}

/** The /auth/callback link from an UzFit email template, as an app-relative path. */
export function callbackPath(html: string): string {
  const match = /href="([^"]*\/auth\/callback[^"]*)"/.exec(html);
  if (!match?.[1]) {
    throw new Error("No callback link in email");
  }
  const url = new URL(match[1].replace(/&amp;/g, "&"));
  return `${url.pathname}${url.search}`;
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
}
