import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

/**
 * End-to-end tests (`npm run test:e2e`). They run against their own database (E2E_DATABASE_URL, wiped and
 * re-seeded on every run) and their own dev server on E2E_PORT (default 3200) with a separate build dir,
 * so they never touch the dev database or a dev server already running on 3000/3100.
 */
const env = loadEnv("e2e", process.cwd(), "");
const port = Number(env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${port}`;
const databaseUrl = env.E2E_DATABASE_URL ?? env.TEST_DATABASE_URL?.replace(/\/warranty_test(\?|$)/, "/warranty_e2e$1");
if (!databaseUrl || databaseUrl === env.DATABASE_URL) throw new Error("Set E2E_DATABASE_URL to a dedicated database (it is wiped on every run)");

export const E2E_ENV = {
  DATABASE_URL: databaseUrl,
  APP_URL: baseURL,
  TRUSTED_ORIGINS: baseURL,
  NEXT_DIST_DIR: ".next-e2e",
  OTP_PROVIDER: "console",
  STORAGE_LOCAL_DIR: "./storage/e2e-uploads",
};
process.env.E2E_DATABASE_URL_RESOLVED = databaseUrl;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${port}`,
    // Not /api/health: it reports 503 until global setup has created the E2E database.
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: E2E_ENV,
  },
});
