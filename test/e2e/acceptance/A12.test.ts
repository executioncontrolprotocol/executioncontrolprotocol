import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { acceptanceRepoRoot } from "./support.js"

/**
 * A12: legacy/ deleted and no workspace path refs.
 */
describe("A12 legacy deleted", () => {
  it("no legacy/ tree and no workspace path refs to legacy/", () => {
    expect(existsSync(path.join(acceptanceRepoRoot, "legacy"))).toBe(false)

    const pnpmWorkspace = readFileSync(path.join(acceptanceRepoRoot, "pnpm-workspace.yaml"), "utf8")
    expect(pnpmWorkspace).not.toMatch(/legacy/)

    const rootPkg = JSON.parse(
      readFileSync(path.join(acceptanceRepoRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> }
    for (const script of Object.values(rootPkg.scripts ?? {})) {
      expect(script).not.toMatch(/\blegacy\b/)
    }

    for (const top of ["packages", "plugins", "test"]) {
      const dir = path.join(acceptanceRepoRoot, top)
      if (!existsSync(dir)) continue
      walkTs(dir, (file, text) => {
        expect(text, file).not.toMatch(/from ["'].*legacy\//)
        expect(text, file).not.toMatch(/require\(["'].*legacy\//)
      })
    }
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
