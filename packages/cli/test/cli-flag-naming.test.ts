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

  it("validate usage shows WORKFLOW-PATH and --config", { timeout: 60_000 }, () => {
    const out = help("workflows validate")
    expect(out).toMatch(/\bWORKFLOW-PATH\b/)
    expect(out).toMatch(/--config\b/)
    expect(out).not.toMatch(/--env\b/)
  })

  it("describe and search expose --config", { timeout: 60_000 }, () => {
    expect(help("environments describe")).toMatch(/--config\b/)
    expect(help("environments search")).toMatch(/--config\b/)
    expect(help("environments describe")).not.toMatch(/--env\b/)
  })

  it("invoke exposes CAPABILITY-ID and --config, not --uses", { timeout: 60_000 }, () => {
    const out = help("environments invoke")
    expect(out).toMatch(/\bCAPABILITY-ID\b/)
    expect(out).toMatch(/--config\b/)
    expect(out).not.toMatch(/--env\b/)
    expect(out).not.toMatch(/--uses\b/)
    expect(out).not.toMatch(/--usesProvider\b/)
  })

  it("run exposes --to and --events", { timeout: 60_000 }, () => {
    const out = help("run")
    expect(out).toMatch(/--to\b/)
    expect(out).toMatch(/--events\b/)
  })

  it("config init exists and environments init does not", { timeout: 60_000 }, () => {
    const configHelp = help("config")
    expect(configHelp).toMatch(/init/)
    expect(configHelp).toMatch(/edit/)
    const envHelp = help("environments")
    expect(envHelp).not.toMatch(/\binit\b/)
    expect(envHelp).not.toMatch(/\bedit\b/)
    expect(help("config init")).toMatch(/config\.ecp\.ts/)
  })

  it("runs resume exposes --to and --approve", { timeout: 60_000 }, () => {
    const out = help("runs resume")
    expect(out).toMatch(/--to\b/)
    expect(out).toMatch(/--approve\b/)
    expect(out).toMatch(/\bRUN-ID\b/)
  })
})
