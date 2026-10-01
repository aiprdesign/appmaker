import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT) || 3100;
export const SITE_PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Most tests type short prompts: skip the app brief ("Don't ask me again"), except in tests/e2e/brief.spec.ts.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: "appmaker.brief.skip", value: "1" }] }] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // The production build, in demo mode so no API key is needed. Private
      // URLs are allowed only so it can import the local fixture website.
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      // With TEST_DATABASE_URL set, accounts and cloud saving are on (and tested).
      env: {
        APPMAKER_DEMO: "1",
        APPMAKER_ALLOW_PRIVATE_URLS: "1",
        ADMIN_PASSWORD: "e2e-admin-password",
        ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
      },
    },
    {
      command: "node tests/fixtures/site-server.mjs",
      url: `http://localhost:${SITE_PORT}`,
      reuseExistingServer: false,
      env: { SITE_PORT: String(SITE_PORT) },
    },
  ],
});
