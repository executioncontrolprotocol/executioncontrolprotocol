import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const runJs = join(cliRoot, "bin", "run.js")
const repoRoot = join(cliRoot, "..", "..")

function help(cmd: string): string {
  return execSync(`node "${runJs}" ${cmd} --help`, {
    encoding: "utf-8",
    cwd: repoRoot,
  })
}

/**
 * User-facing CLI tokens use kebab-case (see `.cursor/rules/cli-crud.mdc`).
 */
describe("CLI flag and arg naming (kebab-case)", () => {
  it("run exposes --dry-run and WORKFLOW-PATH, not camelCase", { timeout: 60_000 }, () => {
    const out = help("run")
    expect(out).toMatch(/--dry-run\b/)
    expect(out).not.toMatch(/--dryRun\b/)
    expect(out).toMatch(/\bWORKFLOW-PATH\b/)
  })

  it("validate usage shows WORKFLOW-PATH and --env", { timeout: 60_000 }, () => {
    const out = help("validate")
    expect(out).toMatch(/\bWORKFLOW-PATH\b/)
    expect(out).toMatch(/--env\b/)
  })

  it("describe and search expose --env", { timeout: 60_000 }, () => {
    expect(help("describe")).toMatch(/--env\b/)
    expect(help("search")).toMatch(/--env\b/)
  })
})
