import { expect, test } from "@playwright/test";
import { anonClient, createMember, demoPassword, signIn, withDb } from "./support/fixtures";

test.describe("access control", () => {
  test("visitors browse published venues but never drafts, in the UI or through the API", async ({ page }) => {
    const slug = `e2e-draft-${Date.now()}`;
    await withDb((db) =>
      db.query(
        `insert into venues (organization_id, slug, name, address, district_id, publication_status)
         select o.id, $1, '{"uz":"E2E qoralama"}', '{"uz":"Namuna koʻchasi"}', d.id, 'draft'
           from organizations o, districts d
          where o.name = 'Demo Sport Group' limit 1`,
        [slug],
      ),
    );

    await page.goto("/en/explore", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
    await expect(page.getByText("E2E qoralama")).toHaveCount(0);

    // The venue page streams (it has a loading state), so a missing venue is a streamed 404:
    // the not-found page is rendered and marked noindex, without any draft content.
    await page.goto(`/en/venues/${slug}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
    await expect(page.getByText("E2E qoralama")).toHaveCount(0);

    const { data, error } = await anonClient().from("venues").select("id").eq("slug", slug);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const venue = await page.goto("/en/venues/olmos-fitness-yunusobod", { waitUntil: "networkidle" });
    expect(venue?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  });

  test("private pages require sign-in and staff areas require the right role", async ({ page }) => {
    await page.goto("/en/bookings");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fbookings/);

    const member = await createMember("E2E Access");
    await signIn(page, member.email, member.password);
    await page.goto("/en/partner");
    await expect(page).toHaveURL(/\/en(\?|$)/);
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en(\?|$)/);
  });

  test("members cannot change their own role or entitlement through direct API requests", async () => {
    const member = await createMember("E2E Direct API");
    const client = anonClient();
    await client.auth.signInWithPassword({ email: member.email, password: member.password });

    const roles = await client.from("platform_roles").insert({ user_id: member.id, role: "admin" });
    expect(roles.error).not.toBeNull();

    const grant = await client.rpc("admin_grant_membership", {
      p_user_id: member.id,
      p_plan_version_id: "b2000000-0000-4000-8000-000000000004",
      p_reason: "self-service attempt",
    });
    expect(grant.error?.message).toMatch(/FORBIDDEN|permission denied/);

    const paid = await client.rpc("apply_payment_event", {
      p_provider: "demo",
      p_dedup_key: "forged",
      p_event_type: "forged",
      p_order_id: "00000000-0000-4000-8000-000000000000",
      p_provider_transaction_id: "forged",
      p_amount_minor: 1,
      p_currency: "UZS",
      p_status: "succeeded",
    });
    expect(paid.error).not.toBeNull();
  });

  test("partner staff cannot open another organization's rosters", async ({ page }) => {
    const sessionId = await withDb(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `select s.id from sessions s join venues v on v.id = s.venue_id
          join organizations o on o.id = v.organization_id
         where o.name = 'Demo Sport Group' order by s.starts_at desc limit 1`,
      );
      return rows[0]!.id;
    });
    await signIn(page, "partner.b.manager@uzfit.test", demoPassword());
    const response = await page.goto(`/en/partner/sessions/${sessionId}`);
    expect(response?.status()).toBe(404);
  });
});
