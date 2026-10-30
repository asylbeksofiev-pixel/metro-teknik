import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a running app + local Supabase with a fresh dev seed:
 *   npx supabase db reset && npm run db:seed && npm run dev
 *   npm run test:e2e
 * Tests share seeded data and are therefore run serially.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "ru-RU", timezoneId: "Asia/Almaty", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
});
