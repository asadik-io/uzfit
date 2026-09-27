import { describe, expect, it } from "vitest";
import { reportRange } from "@/features/partner/report";
import { emptyHours, venueContentSchema } from "@/features/partner/venue-content";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

describe("content security policy", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "abc123",
    supabaseUrl: "https://project.supabase.co",
    isDevelopment: false,
    upgradeInsecure: true,
  });

  it("allows only nonce-bearing scripts", () => {
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("forbids framing, plugins, and foreign form targets", () => {
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("limits network access to the app and Supabase", () => {
    expect(policy).toContain("connect-src 'self' https://project.supabase.co");
  });
});

describe("venue draft content", () => {
  const valid = {
    name: { uz: "Yangi zal", ru: "", en: "New gym" },
    address: { uz: "Namuna koʻchasi, 1" },
    description: { uz: "" },
    rules: { uz: "" },
    district_id: "d1000000-0000-4000-8000-000000000001",
    latitude: 41.3,
    longitude: 69.2,
    contact_phone: null,
    category_ids: ["ca000000-0000-4000-8000-000000000001"],
    amenity_ids: [],
    images: [],
    opening_hours: emptyHours(),
  };

  it("accepts complete content and drops empty translations", () => {
    const parsed = venueContentSchema.parse(valid);
    expect(parsed.name).toEqual({ uz: "Yangi zal", en: "New gym" });
  });

  it("requires an Uzbek name, 1–6 categories, seven days of hours, and paired coordinates", () => {
    expect(venueContentSchema.safeParse({ ...valid, name: { en: "Only English" } }).success).toBe(false);
    expect(venueContentSchema.safeParse({ ...valid, category_ids: [] }).success).toBe(false);
    expect(venueContentSchema.safeParse({ ...valid, opening_hours: emptyHours().slice(1) }).success).toBe(false);
    expect(venueContentSchema.safeParse({ ...valid, longitude: null }).success).toBe(false);
  });
});

describe("attendance report range", () => {
  it("defaults to the last 30 days and caps the range at 93 days", () => {
    expect(reportRange(undefined, undefined, "2026-09-27")).toEqual({ from: "2026-08-29", to: "2026-09-27" });
    expect(reportRange("2026-01-01", "2026-09-27", "2026-09-27")).toEqual({ from: "2026-06-27", to: "2026-09-27" });
    expect(reportRange("2026-09-30", "2026-09-01", "2026-09-27")).toEqual({ from: "2026-09-01", to: "2026-09-01" });
  });
});
