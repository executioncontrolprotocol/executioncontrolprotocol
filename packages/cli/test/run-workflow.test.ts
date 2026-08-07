import { describe, expect, it } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const execFileAsync = promisify(execFile)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const cliBin = join(repoRoot, "packages/cli/bin/run.js")

describe("ecp run workflow source", () => {
  it("runs .ts workflow without pre-compiling to json", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        cliBin,
        "run",
        "examples/01-echo/workflow.ts",
        "--env",
        "examples/01-echo/environment.ts",
      ],
      { cwd: repoRoot, encoding: "utf8" }
    )
    const result = JSON.parse(stdout) as { run: { status: string }; state?: { echo: unknown } }
    expect(result.run.status).toBe("completed")
    expect(result.state?.echo).toEqual({ echo: "hello from fluent API" })
  }, 30_000)
})
