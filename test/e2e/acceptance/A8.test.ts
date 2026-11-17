import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { acceptanceRepoRoot } from "./support.js"

/** Strip `//` line comments so `test("…")` in comments is not collected. */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//")
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join("\n")
}

/** Collect Playwright `test("…")` / `test('…')` titles from source (not comment-only matches). */
export function collectPlaywrightTestTitles(source: string): string[] {
  const titles: string[] = []
  const pattern = /\btest\s*\(\s*(["'`])([\s\S]*?)\1/g
  const code = stripLineComments(source)
  let match: RegExpExecArray | null
  while ((match = pattern.exec(code)) !== null) {
    titles.push(match[2] ?? "")
  }
  return titles
}

/**
 * A8 App scenarios live in Playwright (`packages/app/test/e2e/a8-app.spec.ts`).
 * CI runs them via `pnpm run test:app` on Ubuntu and Windows.
 * This file gates that the suite is present and covers the acceptance surface.
 */
describe("A8 App Playwright suite present", () => {
  const specPath = path.join(acceptanceRepoRoot, "packages/app/test/e2e/a8-app.spec.ts")

  it("a8-app.spec.ts titles cover the acceptance surface", () => {
    expect(existsSync(specPath)).toBe(true)
    const body = readFileSync(specPath, "utf8")
    expect(body).toMatch(/A8 App/)
    const titles = collectPlaywrightTestTitles(body)
    const required = [
      { needle: "unauthorized", label: "unauthorized access" },
      { needle: "opens by path", label: "open by path" },
      { needle: "hot-reload", label: "validation hot reload" },
      { needle: "invalid JSON", label: "invalid JSON recovery" },
      { needle: "$script.path", label: "$script.path re-validation" },
      { needle: "live statuses", label: "live run statuses" },
      { needle: "runs list replays statuses on the graph", label: "graph replay" },
      { needle: "open by id", label: "open by id" },
    ] as const
    for (const { needle, label } of required) {
      expect(
        titles.some((title) => title.includes(needle)),
        `missing Playwright title for ${label}`,
      ).toBe(true)
    }
  })

  it("collectPlaywrightTestTitles ignores comment-only matches", () => {
    const sample = `
      // test("runs list replays statuses on the graph")
      test("other", async () => {})
    `
    const titles = collectPlaywrightTestTitles(sample)
    expect(titles).toEqual(["other"])
    expect(titles.some((t) => t.includes("runs list replays statuses on the graph"))).toBe(false)
  })

  it("collectPlaywrightTestTitles reads real multi-line titles", () => {
    const sample = `test("runs list replays statuses on the graph", async () => {})`
    expect(collectPlaywrightTestTitles(sample)).toEqual(["runs list replays statuses on the graph"])
  })

  it("collectPlaywrightTestTitles ignores titles split across quotes", () => {
    const sample = `test("runs list replays" + " statuses on the graph", async () => {})`
    const titles = collectPlaywrightTestTitles(sample)
    expect(titles).not.toContain("runs list replays statuses on the graph")
  })
})