import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. These journeys need the FULL stack running before
 * `npm run test:e2e`:
 *   1. Postgres 17 + pgvector with migrations applied (`npm run db:migrate`)
 *   2. the pg-boss worker (`npm run worker`) — ingestion won't progress without it
 *   3. the Next dev server (`npm run dev`)
 * Point E2E_BASE_URL at the running app (defaults to http://localhost:3000).
 */
export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // webServer intentionally commented out: the app needs a database and a
  // worker alongside it, so a bare `next dev` spawned here would produce a
  // broken half-stack. Start the stack manually (see the header note) instead.
  // webServer: {
  //   command: "npm run dev",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: true,
  // },
});
