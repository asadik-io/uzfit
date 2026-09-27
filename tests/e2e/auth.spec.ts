import { expect, test } from "@playwright/test";
import { callbackPath, latestEmailHtml, uniqueEmail } from "./support/fixtures";

test.describe("email authentication", () => {
  test("a new member registers, verifies the email, resumes the session, signs out, and signs in", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("signup");
    const password = `Signup${Date.now() % 100000}pw`;

    await page.goto("/en/signup", { waitUntil: "networkidle" });
    await page.getByLabel("Your name").fill("E2E Signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();

    const html = await latestEmailHtml(email, /confirm your email/);
    await page.goto(callbackPath(html));
    await expect(page).toHaveURL(/\/en\/plans/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    // The session survives a reload and a new tab in the same browser.
    const second = await context.newPage();
    await second.goto("/en/profile");
    await expect(second.getByLabel("Your name")).toHaveValue("E2E Signup");
    await second.close();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en(\?|$)/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/en/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`${password}-wrong`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("The email or password is incorrect.")).toBeVisible();

    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/explore/);
  });

  test("a member resets a forgotten password through the emailed link", async ({ page }) => {
    const email = uniqueEmail("reset");
    const password = `Reset${Date.now() % 100000}pw`;
    const newPassword = `Changed${Date.now() % 100000}pw`;

    await page.goto("/en/signup", { waitUntil: "networkidle" });
    await page.getByLabel("Your name").fill("E2E Reset");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.goto(callbackPath(await latestEmailHtml(email, /confirm your email/)));
    await expect(page).toHaveURL(/\/en\/plans/);
    await page.context().clearCookies();

    await page.goto("/en/forgot-password", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

    await page.goto(callbackPath(await latestEmailHtml(email, /reset your password/)));
    await expect(page).toHaveURL(/\/en\/reset-password/);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/en\/profile/);

    await page.context().clearCookies();
    await page.goto("/en/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/explore/);
  });
});
