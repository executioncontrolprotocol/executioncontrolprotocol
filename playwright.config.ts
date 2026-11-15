import { defineConfig } from "@playwright/test"

/**
 * App end-to-end tests (acceptance A8). Specs start a real host in a temp `ECP_HOME`.
 */
export default defineConfig({
  testDir: "packages/app/test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    trace: "on-first-retry",
  },
})
