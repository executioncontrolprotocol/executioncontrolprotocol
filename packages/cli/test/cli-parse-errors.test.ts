import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const runJs = join(cliRoot, "bin", "run.js")
const repoRoot = join(cliRoot, "..", "..")

function runExpectFailure(args: string): { status: number; stderr: string } {
  try {
    execSync(`node "${runJs}" ${args}`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { status: 0, stderr: "" }
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string }
    return { status: e.status ?? 1, stderr: String(e.stderr ?? "") }
  }
}

describe("ecp parse errors", () => {
  it("run without --env exits non-zero", { timeout: 60_000 }, () => {
    const { status, stderr } = runExpectFailure(
      "run examples/01-echo/workflow.ts"
    )
    expect(status).not.toBe(0)
    expect(stderr.length).toBeGreaterThan(0)
  })

  it("run without workflow path exits non-zero", { timeout: 60_000 }, () => {
    const { status } = runExpectFailure(
      "run --env examples/01-echo/environment.ts"
    )
    expect(status).not.toBe(0)
  })
})
