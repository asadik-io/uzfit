import { expect, test } from "@playwright/test";
import { demoPassword, expectNoHorizontalOverflow, signIn } from "./support/fixtures";

test.use({ viewport: { width: 360, height: 780 } });

const visitorPages = [
  "/uz",
  "/uz/explore",
  "/ru/venues/olmos-fitness-yunusobod",
  "/en/plans",
  "/uz/login",
  "/ru/signup",
];
const memberPages = [
  "/uz/bookings",
  "/ru/bookings?tab=past",
  "/en/membership",
  "/uz/profile",
  "/ru/notifications",
  "/en/favorites",
];
const partnerPages = [
  "/uz/partner",
  "/ru/partner/scanner",
  "/en/partner/schedule",
  "/uz/partner/venues",
  "/en/partner/reports",
];
const adminPages = ["/uz/admin", "/en/admin/revisions", "/ru/admin/users", "/en/admin/payments", "/uz/admin/plans"];

test.describe("360px layouts have no horizontal overflow", () => {
  test("public pages", async ({ page }) => {
    for (const path of visitorPages) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, path);
    }
  });

  test("member pages", async ({ page }) => {
    await signIn(page, "member@uzfit.test", demoPassword());
    for (const path of memberPages) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, path);
    }
  });

  test("partner pages", async ({ page }) => {
    await signIn(page, "partner.a.manager@uzfit.test", demoPassword());
    for (const path of partnerPages) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, path);
    }
  });

  test("admin pages", async ({ page }) => {
    await signIn(page, "admin@uzfit.test", demoPassword());
    for (const path of adminPages) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page, path);
    }
  });
});

test.describe("keyboard access", () => {
  test("the skip link and the main navigation work from the keyboard", async ({ page }) => {
    await page.goto("/en", { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("a member can open and close the booking dialog with the keyboard", async ({ page }) => {
    await signIn(page, "member@uzfit.test", demoPassword());
    await page.goto("/en/explore", { waitUntil: "networkidle" });
    await page.goto(
      "/en/venues/olmos-fitness-yunusobod?date=" +
        (await page.evaluate(() => {
          const d = new Date(Date.now() + 3 * 86_400_000);
          return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d);
        })),
      { waitUntil: "networkidle" },
    );
    const book = page.getByRole("button", { name: "Book session" }).first();
    test.skip((await book.count()) === 0, "No bookable session on that day for the demo member");
    await book.focus();
    await expect(book).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(book).toBeFocused();
  });
});
