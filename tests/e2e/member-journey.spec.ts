import { expect, test } from "@playwright/test";
import {
  createMember,
  createSession,
  demoPassword,
  signedInPage,
  tashkentDate,
  tashkentTime,
} from "./support/fixtures";

test("a demo member activates a plan, books, cancels, books again, and checks in with partner staff", async ({
  browser,
}) => {
  const member = await createMember("E2E Journey");
  // Two days ahead avoids the one-visit-per-day rule interacting with the session starting soon.
  const laterDate = tashkentDate(2);
  const later = await createSession({ venueSlug: "temir-gym", date: laterDate, time: "06:15", capacity: 6 });
  const soon = await createSession({ venueSlug: "olmos-fitness-yunusobod", startsInMinutes: 10, capacity: 6 });

  const page = await signedInPage(browser, member.email, member.password);

  // Demo checkout activates a membership only through the verified payment path.
  await page.goto("/en/plans", { waitUntil: "networkidle" });
  await page.locator("#plan-start").getByRole("link", { name: "Choose plan" }).click();
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to demo payment" }).click();
  await expect(page.getByRole("heading", { name: "Demo payment provider" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible();

  // Book the later session, cancel it in time, and book it again.
  const laterRow = () => page.locator("li", { hasText: `${tashkentTime(later.startsAt)}–` });
  await page.goto(`/en/venues/temir-gym?date=${laterDate}`, { waitUntil: "networkidle" });
  await laterRow().getByRole("button", { name: "Book session" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Free cancellation until")).toBeVisible();
  await dialog.getByRole("button", { name: "Book session" }).click();
  await expect(page).toHaveURL(/\/en\/bookings\/[0-9a-f-]+\?created=1/);
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByRole("dialog").getByText("Free cancellation", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("The visit was returned to your membership")).toBeVisible();

  await page.goto(`/en/venues/temir-gym?date=${laterDate}`, { waitUntil: "networkidle" });
  await laterRow().getByRole("button", { name: "Book session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Book session" }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  // Book the session starting soon and open its check-in code.
  await page.goto("/en/venues/olmos-fitness-yunusobod", { waitUntil: "networkidle" });
  await page
    .locator("li", { hasText: `${tashkentTime(soon.startsAt)}–` })
    .getByRole("button", { name: "Book session" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Book session" }).click();
  await expect(page).toHaveURL(/\/en\/bookings\/[0-9a-f-]+\?created=1/);
  await page.getByRole("button", { name: "Show check-in QR" }).click();
  await expect(page.getByRole("img", { name: "Check-in QR code" })).toBeVisible();
  await page.getByText("Reception can't scan the code?").click();
  const code = ((await page.locator("p.font-mono").textContent()) ?? "").trim();
  expect(code).toMatch(/^UZFIT1:[A-Za-z0-9_-]{43}$/);

  // Reception checks the member in (paste fallback), and a replay is refused.
  const reception = await signedInPage(browser, "partner.a.reception@uzfit.test", demoPassword());
  await reception.goto(`/en/partner/scanner?venue=${soon.venueId}`, { waitUntil: "networkidle" });
  await reception.getByLabel("Enter a code manually").fill(code);
  await reception.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(reception.getByText("Checked in", { exact: true })).toBeVisible();
  await expect(reception.getByText("E2E Journey")).toBeVisible();
  await reception.getByLabel("Enter a code manually").fill(code);
  await reception.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(reception.getByText("This code was already used.")).toBeVisible();

  // The member's screen reflects the committed check-in.
  await expect(page.getByText("You're checked in")).toBeVisible({ timeout: 20_000 });

  // Usage: 8 visits, 1 used (check-in), 1 reserved (the later booking).
  await page.goto("/en/membership", { waitUntil: "networkidle" });
  await expect(page.getByText("of 8 available")).toBeVisible();
  await expect(page.locator("p", { hasText: "of 8 available" }).locator("span").first()).toHaveText("6");
});
