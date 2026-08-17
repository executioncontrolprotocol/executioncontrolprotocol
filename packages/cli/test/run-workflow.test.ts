import { describe, expect, it } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const execFileAsync = promisify(execFile)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const cliBin = join(repoRoot, "packages/cli/bin/run.js")

const ACCEPTS_WORKFLOW = "examples/07-accepts-returns/workflow.ts"
const ACCEPTS_ENV = "examples/07-accepts-returns/environment.ts"
const ACCEPTS_INPUT = "examples/07-accepts-returns/input.json"

interface CliResult {
  code: number
  stdout: string
  stderr: string
}

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolve({ code, stdout, stderr })
      }
    )
  })
}

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

  it("runs accepts/returns example with --input", async () => {
    const res = await runCli(["run", ACCEPTS_WORKFLOW, "--env", ACCEPTS_ENV, "--input", ACCEPTS_INPUT])
    expect(res.code).toBe(0)
    const result = JSON.parse(res.stdout) as {
      run: { status: string }
      output?: { echo?: unknown }
    }
    expect(result.run.status).toBe("completed")
    expect(result.output?.echo).toEqual({ echo: "hello from input" })
  }, 30_000)

  it("exits non-zero when --input fails accepts validation", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "ecp-accepts-"))
    const badInput = join(tmp, "bad.json")
    await writeFile(badInput, JSON.stringify({ value: 1 }), "utf8")
    try {
      const res = await runCli(["run", ACCEPTS_WORKFLOW, "--env", ACCEPTS_ENV, "--input", badInput])
      expect(res.code).not.toBe(0)
      expect(`${res.stderr}\n${res.stdout}`).toMatch(/accepts validation failed/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }, 30_000)

  it("dry-run with valid input completes without executing steps", async () => {
    const res = await runCli([
      "run",
      ACCEPTS_WORKFLOW,
      "--env",
      ACCEPTS_ENV,
      "--input",
      ACCEPTS_INPUT,
      "--dry-run",
    ])
    expect(res.code).toBe(0)
    const result = JSON.parse(res.stdout) as {
      run: { id: string; status: string }
      state?: Record<string, unknown>
      history?: unknown
    }
    expect(result.run.status).toBe("completed")
    expect(result.run.id).toBe("dry-run")
    expect(result.state).toEqual({ value: "hello from input" })
    expect(result.history).toBeUndefined()
  }, 30_000)

  it("dry-run with missing required input exits non-zero", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "ecp-accepts-dry-"))
    const emptyInput = join(tmp, "empty.json")
    await writeFile(emptyInput, JSON.stringify({}), "utf8")
    try {
      const res = await runCli([
        "run",
        ACCEPTS_WORKFLOW,
        "--env",
        ACCEPTS_ENV,
        "--input",
        emptyInput,
        "--dry-run",
      ])
      expect(res.code).not.toBe(0)
      expect(`${res.stderr}\n${res.stdout}`).toMatch(/accepts validation failed/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }, 30_000)
})
