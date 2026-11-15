import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { acceptanceRepoRoot } from "./support.js"

/**
 * A8 App scenarios live in Playwright (`packages/app/test/e2e/a8-app.spec.ts`).
 * CI runs them via `pnpm run test:app` on Ubuntu and Windows.
 * This file gates that the suite is present and covers the acceptance surface.
 */
describe("A8 App Playwright suite present", () => {
  it("a8-app.spec.ts covers open, hot reload, run overlay, and runs list", () => {
    const spec = path.join(acceptanceRepoRoot, "packages/app/test/e2e/a8-app.spec.ts")
    expect(existsSync(spec)).toBe(true)
    const body = readFileSync(spec, "utf8")
    expect(body).toMatch(/A8 App/)
    expect(body).toMatch(/validation-clean/)
    expect(body).toMatch(/editing \$script\.path/)
    expect(body).toMatch(/run updates live statuses/)
    expect(body).toMatch(/runs list replays/)
  })
})
