import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const runJs = join(cliRoot, "bin", "run.js")
const repoRoot = join(cliRoot, "..", "..")

function runHelp(args: string): void {
  execSync(`node "${runJs}" ${args} --help`, { cwd: repoRoot, encoding: "utf8" })
}

describe("ecp --help", () => {
  it("prints top-level help", { timeout: 60_000 }, () => {
    const out = execSync(`node "${runJs}" --help`, { cwd: repoRoot, encoding: "utf8" })
    expect(out).toMatch(/\bworkflows\b/)
    expect(out).toMatch(/\benvironments\b/)
    expect(out).toMatch(/\brun\b/)
    expect(out).not.toMatch(/^\s+compile\s/m)
    expect(out).not.toMatch(/^\s+validate\s/m)
    expect(out).not.toMatch(/^\s+describe\s/m)
    expect(out).not.toMatch(/\bencode\b/)
    expect(out).not.toMatch(/\bdecode\b/)
    expect(out).not.toMatch(/\bup\b/)
    expect(out).not.toMatch(/\bmcp\b/)
  })

  it("prints per-command help", { timeout: 60_000 }, () => {
    runHelp("run")
    runHelp("workflows compile")
    runHelp("workflows validate")
    runHelp("environments describe")
    runHelp("environments search")
    runHelp("environments invoke")
    runHelp("config secrets")
    runHelp("config secrets add")
  })
})
