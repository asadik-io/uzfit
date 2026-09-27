import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_000000000000",
  PAYMENT_PROVIDER: "demo",
  PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-0123456789",
};

/** env.ts caches the parsed environment, so each scenario loads fresh modules. */
async function loadDemo(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ["APP_ENV", "VERCEL_ENV", ...Object.keys(BASE_ENV)]) {
    delete process.env[key];
  }
  Object.assign(process.env, BASE_ENV, env);
  return import("@/lib/payments/demo");
}

const ORDER = "7f2c7c1e-5b1a-4e8e-9b43-1d2f4f0a9c11";

describe("demo payment adapter", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("accepts its own signed events and normalizes them", async () => {
    const { demoAdapter, signDemoEvent } = await loadDemo({});
    const event = signDemoEvent({ orderId: ORDER, amountMinor: 29_900_000, currency: "UZS", status: "succeeded" });
    const result = await demoAdapter.verifyCallback(event);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        orderId: ORDER,
        amountMinor: 29_900_000,
        currency: "UZS",
        status: "succeeded",
      });
      expect(result.events[0]?.dedupKey).toMatch(/^event:/);
    }
  });

  it("rejects tampered bodies and missing signatures", async () => {
    const { demoAdapter, signDemoEvent } = await loadDemo({});
    const event = signDemoEvent({ orderId: ORDER, amountMinor: 100, currency: "UZS", status: "succeeded" });
    const tampered = {
      rawBody: event.rawBody.replace('"amount_minor":100', '"amount_minor":1'),
      headers: event.headers,
    };
    expect(await demoAdapter.verifyCallback(tampered)).toMatchObject({ ok: false, httpStatus: 401 });
    expect(await demoAdapter.verifyCallback({ rawBody: event.rawBody, headers: new Headers() })).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
  });

  it("rejects replays of old events", async () => {
    const { demoAdapter, signDemoEvent } = await loadDemo({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    const event = signDemoEvent({ orderId: ORDER, amountMinor: 100, currency: "UZS", status: "succeeded" });
    vi.setSystemTime(new Date("2026-09-27T10:10:00Z"));
    expect(await demoAdapter.verifyCallback(event)).toMatchObject({ ok: false, reason: "stale_timestamp" });
  });

  it("is refused in production even when configured", async () => {
    const { demoAdapter, signDemoEvent } = await loadDemo({ APP_ENV: "production" });
    expect(demoAdapter.isAvailable()).toBe(false);
    const event = signDemoEvent({ orderId: ORDER, amountMinor: 100, currency: "UZS", status: "succeeded" });
    expect(await demoAdapter.verifyCallback(event)).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it("is refused on Vercel production deployments", async () => {
    const { demoAdapter } = await loadDemo({ VERCEL_ENV: "production" });
    expect(demoAdapter.isAvailable()).toBe(false);
  });

  it("offers no checkout when another provider is selected without an integration", async () => {
    vi.resetModules();
    Object.assign(process.env, BASE_ENV, { PAYMENT_PROVIDER: "payme" });
    delete process.env.APP_ENV;
    delete process.env.VERCEL_ENV;
    const { checkoutAdapter, adapterFor } = await import("@/lib/payments");
    expect(checkoutAdapter()).toBeNull();
    expect(await adapterFor("payme").verifyCallback({ rawBody: "{}", headers: new Headers() })).toMatchObject({
      ok: false,
      httpStatus: 403,
    });
  });
});
