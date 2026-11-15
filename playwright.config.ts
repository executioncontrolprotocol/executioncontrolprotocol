import { defineConfig } from "@playwright/test"

/**
 * App end-to-end tests. The suite itself arrives in Phase 7; until then the
 * project is empty and `test:app` passes with `--pass-with-no-tests`.
 */
export default defineConfig({
  testDir: "packages/app/test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: "line",
})
