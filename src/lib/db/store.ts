import "server-only";
import { addDays, localDateString } from "@/lib/time";
import {
  type Actor,
  nowIso,
  notify,
  bookingNoticeParams,
  revokeOpenTokens,
  rowsWhere,
  setBookingState,
  audit,
} from "./core";
import type { Tables } from "./query";
import { buildSeed, extendSessions, SESSION_DAYS_AHEAD, TZ } from "./seed";

/**
 * Process-wide in-memory database. Each server instance builds the demo dataset on first use;
 * changes made by visitors live in that instance until it restarts. Light maintenance runs on
 * access: the schedule is extended as days pass, finished reservations become no-shows and
 * abandoned checkouts expire, exactly as the former scheduled job did.
 */
export interface StoredUpload {
  bytes: Uint8Array;
  contentType: string;
}

export interface Store {
  tables: Tables;
  bootAt: string;
  generatedThrough: string;
  lastTick: number;
  uploads: Map<string, StoredUpload>;
  rateLimits: Map<string, { windowStart: number; count: number }>;
}

const SYSTEM: Actor = { uid: null, aal: "aal1", role: "service_role", requestId: null };
const TICK_INTERVAL_MS = 15_000;

declare global {
  var __uzfitStore: Store | undefined;
}

export function getStore(): Store {
  if (!globalThis.__uzfitStore) {
    const now = new Date();
    const seed = buildSeed(now);
    globalThis.__uzfitStore = {
      tables: seed.tables,
      bootAt: now.toISOString(),
      generatedThrough: seed.generatedThrough,
      lastTick: 0,
      uploads: new Map(),
      rateLimits: new Map(),
    };
  }
  tick(globalThis.__uzfitStore);
  return globalThis.__uzfitStore;
}

/** Resets the dataset (used by the maintenance route to start a fresh demo). */
export function resetStore(): Store {
  globalThis.__uzfitStore = undefined;
  return getStore();
}

function tick(store: Store): void {
  const now = Date.now();
  if (now - store.lastTick < TICK_INTERVAL_MS) return;
  store.lastTick = now;
  const today = localDateString(new Date(now), TZ);
  const target = addDays(today, SESSION_DAYS_AHEAD);
  if (store.generatedThrough < target) {
    extendSessions(store.tables, addDays(store.generatedThrough, 1), target, new Date(now).toISOString(), null);
    store.generatedThrough = target;
  }
  reconcileNoShows(store.tables, 2000);
  expireStaleOrders(store.tables, 1000);
}

/** Confirmed reservations whose session has ended become no-shows. Returns the count. */
export function reconcileNoShows(tables: Tables, limit: number): number {
  const at = nowIso();
  const due = rowsWhere(tables, "bookings", (b) => b.state === "confirmed" && String(b.session_ends_at) <= at)
    .sort((a, b) => String(a.session_ends_at).localeCompare(String(b.session_ends_at)))
    .slice(0, Math.min(Math.max(limit, 1), 2000));
  for (const booking of due) {
    setBookingState(tables, booking, "no_show", { finalized_at: at });
    revokeOpenTokens(tables, booking.id, at);
    notify(tables, String(booking.user_id), "no_show_recorded", bookingNoticeParams(tables, booking.id));
  }
  if (due.length > 0) {
    audit(tables, SYSTEM, "system", "booking.no_show_batch", "booking", null, null, null, null, { count: due.length });
  }
  return due.length;
}

/** Pending checkouts abandoned for more than 15 minutes past expiry are cancelled. */
export function expireStaleOrders(tables: Tables, limit: number): number {
  const at = nowIso();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const stale = rowsWhere(tables, "orders", (o) => o.status === "pending" && String(o.expires_at) < cutoff)
    .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))
    .slice(0, Math.min(Math.max(limit, 1), 1000));
  for (const order of stale) {
    Object.assign(order, { status: "cancelled", cancelled_at: at, updated_at: at });
  }
  return stale.length;
}

/** Fixed-window rate limit kept per instance. Returns true when the request may proceed. */
export function consumeRateLimit(store: Store, bucket: string, max: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = store.rateLimits.get(bucket);
  if (!entry || now - entry.windowStart >= windowSeconds * 1000) {
    store.rateLimits.set(bucket, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

/** Removes expired rate-limit windows and unused expired tokens; returns the counts. */
export function cleanupEphemeral(store: Store): { rate_limit_windows: number; checkin_tokens: number } {
  const now = Date.now();
  let windows = 0;
  for (const [bucket, entry] of store.rateLimits) {
    if (now - entry.windowStart > 2 * 86_400_000) {
      store.rateLimits.delete(bucket);
      windows++;
    }
  }
  const cutoff = new Date(now - 7 * 86_400_000).toISOString();
  const tokens = store.tables.checkin_tokens ?? [];
  let removed = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.used_at === null && String(token.expires_at) < cutoff) {
      tokens.splice(i, 1);
      removed++;
    }
  }
  return { rate_limit_windows: windows, checkin_tokens: removed };
}
