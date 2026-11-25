import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { findLegacyPathRefs } from "../../../bench/legacy-path-scan.mjs"
import { acceptanceRepoRoot } from "./support.js"

const SCAN_ROOTS = ["scripts", "fixtures", "examples", ".github", "packages", "plugins", "test", "bench"]
const ROOT_CONFIGS = [
  "tsconfig.json",
  "tsconfig.build.json",
  "eslint.config.js",
  "vitest.config.mts",
  "pnpm-workspace.yaml",
  "package.json",
]

/**
 * A12: legacy/ deleted and no workspace path refs.
 */
describe("A12 legacy deleted", () => {
  it("no legacy/ tree and no workspace path refs to legacy/", () => {
    expect(existsSync(path.join(acceptanceRepoRoot, "legacy"))).toBe(false)

    const pnpmWorkspace = readFileSync(path.join(acceptanceRepoRoot, "pnpm-workspace.yaml"), "utf8")
    expect(pnpmWorkspace).not.toMatch(/legacy\//)

    const rootPkg = JSON.parse(
      readFileSync(path.join(acceptanceRepoRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> }
    for (const script of Object.values(rootPkg.scripts ?? {})) {
      expect(script).not.toMatch(/legacy\//)
    }

    for (const relRoot of SCAN_ROOTS) {
      const dir = path.join(acceptanceRepoRoot, relRoot)
      if (!existsSync(dir)) continue
      walkTs(dir, (file, text) => {
        expect(text, file).not.toMatch(/from ["'].*legacy\//)
        expect(text, file).not.toMatch(/require\(["'].*legacy\//)
      })
    }

    for (const name of ROOT_CONFIGS) {
      const file = path.join(acceptanceRepoRoot, name)
      if (!existsSync(file)) continue
      const text = readFileSync(file, "utf8")
      expect(text, file).not.toMatch(/legacy\//)
    }

    const violations = findLegacyPathRefs(acceptanceRepoRoot)
    expect(violations, violations.join("\n")).toEqual([])
  })
})

function walkTs(dir: string, visit: (file: string, text: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTs(full, visit)
      continue
    }
    if (!/\.(ts|mts|js|mjs)$/.test(entry.name)) continue
    visit(full, readFileSync(full, "utf8"))
  }
}