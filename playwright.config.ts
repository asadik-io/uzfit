import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "./tests/e2e/support/load-env";

// Local Supabase keys and demo settings (never committed; see .env.example).
loadEnvFile(".env.local");

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "tests/e2e",
  // The journeys share one database; run them one at a time for deterministic state.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Uses an already running server (pnpm dev or pnpm start); otherwise starts the production build.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
