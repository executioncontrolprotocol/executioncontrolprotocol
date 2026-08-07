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
    expect(out).toMatch(/\bcompile\b/)
    expect(out).toMatch(/\bencode\b/)
    expect(out).toMatch(/\bdecode\b/)
    expect(out).toMatch(/\brun\b/)
    expect(out).not.toMatch(/\bmcp\b/)
  })

  it("prints per-command help", { timeout: 60_000 }, () => {
    runHelp("run")
    runHelp("compile")
    runHelp("encode")
    runHelp("decode")
    runHelp("validate")
    runHelp("describe")
    runHelp("search")
    runHelp("config secrets")
    runHelp("config secrets add")
  })
})
