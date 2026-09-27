import { expect, test } from "@playwright/test";

test("the web manifest, icons, service worker, and offline page are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { icons: Array<{ src: string; purpose?: string }>; display: string };
  expect(body.display).toBe("standalone");
  expect(body.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of body.icons) {
    const response = await request.get(icon.src);
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["cache-control"]).toContain("no-store");

  const offline = await request.get("/offline.html");
  expect(offline.ok()).toBe(true);
  expect(await offline.text()).toContain("Internet aloqasi yoʻq");
});

test("pages carry security headers and a nonce-based CSP", async ({ request }) => {
  const response = await request.get("/uz");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-request-id"]).toBeTruthy();
});

test("the reconciliation job refuses unauthenticated calls", async ({ request }) => {
  const response = await request.get("/api/jobs/reconcile");
  expect([401, 503]).toContain(response.status());
});
