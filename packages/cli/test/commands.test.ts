import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const cliBin = join(repoRoot, "packages/cli/bin/run.js")

const ECHO_ENV = "examples/01-echo/environment.ts"
const ECHO_WORKFLOW_TS = "examples/01-echo/workflow.ts"
const ECHO_WORKFLOW_JSON = "examples/01-echo/workflow.json"

const BROKEN_WORKFLOW = JSON.stringify({
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "broken" },
  steps: [{ type: "step", id: "x", uses: "@executioncontrolprotocol/test.does-not-exist", input: {}, as: "x" }],
})

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

describe("ecp CLI commands", () => {
  let tmp: string
  let brokenWorkflowPath: string
  let toonPath: string

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ecp-cli-"))
    brokenWorkflowPath = join(tmp, "broken.json")
    toonPath = join(tmp, "workflow.toon")
    await writeFile(brokenWorkflowPath, BROKEN_WORKFLOW, "utf8")
  })

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  describe("compile", () => {
    it("compiles a .ts workflow to a JSON manifest on stdout", async () => {
      const res = await runCli(["compile", ECHO_WORKFLOW_TS])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(res.stdout) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("writes the manifest to -o output file", async () => {
      const out = join(tmp, "compiled.json")
      const res = await runCli(["compile", ECHO_WORKFLOW_TS, "-o", out])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(await readFile(out, "utf8")) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("fails on a missing source file", async () => {
      const res = await runCli(["compile", "does/not/exist.ts"])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("validate", () => {
    it("reports a valid workflow and exits 0", async () => {
      const res = await runCli(["validate", ECHO_WORKFLOW_TS, "--env", ECHO_ENV])
      expect(res.code).toBe(0)
      const result = JSON.parse(res.stdout) as { valid: boolean }
      expect(result.valid).toBe(true)
    }, 30_000)

    it("exits non-zero for an unknown capability", async () => {
      const res = await runCli(["validate", brokenWorkflowPath, "--env", ECHO_ENV])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("run", () => {
    it("exits non-zero when the workflow cannot run", async () => {
      const res = await runCli(["run", brokenWorkflowPath, "--env", ECHO_ENV])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("describe", () => {
    it("returns a descriptor including the echo capability", async () => {
      const res = await runCli(["describe", "--env", ECHO_ENV])
      expect(res.code).toBe(0)
      const descriptor = JSON.parse(res.stdout) as { capabilities: { id: string }[] }
      expect(descriptor.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
    }, 30_000)
  })

  describe("search", () => {
    it("returns search results for a query", async () => {
      const res = await runCli(["search", "echo", "--env", ECHO_ENV])
      expect(res.code).toBe(0)
      const result = JSON.parse(res.stdout) as { results: unknown[] }
      expect(Array.isArray(result.results)).toBe(true)
    }, 30_000)
  })

  describe("encode", () => {
    it("encodes a manifest as JSON", async () => {
      const res = await runCli([
        "encode",
        ECHO_WORKFLOW_JSON,
        "--format",
        "json",
        "--env",
        ECHO_ENV,
      ])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(res.stdout) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("encodes a manifest as TOON to a file", async () => {
      const res = await runCli([
        "encode",
        ECHO_WORKFLOW_JSON,
        "--format",
        "toon",
        "--env",
        ECHO_ENV,
        "-o",
        toonPath,
      ])
      expect(res.code).toBe(0)
      const toon = await readFile(toonPath, "utf8")
      expect(toon.trim().length).toBeGreaterThan(0)
    }, 30_000)

    it("fails on an unknown format", async () => {
      const res = await runCli([
        "encode",
        ECHO_WORKFLOW_JSON,
        "--format",
        "xml",
        "--env",
        ECHO_ENV,
      ])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("decode", () => {
    it("decodes JSON passthrough to a workflow manifest", async () => {
      const res = await runCli([
        "decode",
        ECHO_WORKFLOW_JSON,
        "--format",
        "json",
        "--env",
        ECHO_ENV,
      ])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(res.stdout) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("round-trips a TOON file back to a manifest", async () => {
      // Depends on the TOON file produced by the encode test above.
      const res = await runCli([
        "decode",
        toonPath,
        "--format",
        "toon",
        "--env",
        ECHO_ENV,
      ])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(res.stdout) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)
  })

  describe("invoke", () => {
    it("invokes a bound capability and prints InvokeResult", async () => {
      const inputPath = join(tmp, "invoke-input.json")
      await writeFile(inputPath, JSON.stringify({ value: "cli-hi" }), "utf8")
      const res = await runCli([
        "invoke",
        "@executioncontrolprotocol/test.echo",
        "--env",
        ECHO_ENV,
        "--input",
        inputPath,
      ])
      expect(res.code).toBe(0)
      const result = JSON.parse(res.stdout) as {
        schema: string
        success: boolean
        result?: { echo?: unknown }
      }
      expect(result.schema).toBe("@executioncontrolprotocol.invoke.result")
      expect(result.success).toBe(true)
      expect(result.result?.echo).toBe("cli-hi")
    }, 30_000)

    it("exits non-zero when the capability is missing", async () => {
      const res = await runCli([
        "invoke",
        "@executioncontrolprotocol/test.does-not-exist",
        "--env",
        ECHO_ENV,
      ])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("test session", () => {
    const TWO_STEP_WF = "packages/cli/test/fixtures/two-step/workflow.ts"
    const TWO_STEP_ENV = "packages/cli/test/fixtures/two-step/environment.ts"

    it("start → run --to → rerun clears downstream", async () => {
      const sessionPath = join(tmp, "session.json")
      const start = await runCli([
        "test",
        "start",
        TWO_STEP_WF,
        "--env",
        TWO_STEP_ENV,
        "-o",
        sessionPath,
      ])
      expect(start.code).toBe(0)

      const runTo = await runCli([
        "test",
        "run",
        "--to",
        "second",
        "--env",
        TWO_STEP_ENV,
        "--session",
        sessionPath,
      ])
      expect(runTo.code).toBe(0)
      const full = JSON.parse(runTo.stdout) as {
        status: string
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
      expect(full.history.first?.status).toBe("completed")
      expect(full.history.second?.status).toBe("completed")
      expect(full.state.second).toBeDefined()

      const rerun = await runCli([
        "test",
        "rerun",
        "first",
        "--env",
        TWO_STEP_ENV,
        "--session",
        sessionPath,
      ])
      expect(rerun.code).toBe(0)
      const after = JSON.parse(rerun.stdout) as {
        status: string
        cursor?: string
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
      expect(after.cursor).toBe("first")
      expect(after.history.first?.status).toBe("completed")
      expect(after.history.second).toBeUndefined()
      expect(after.state.second).toBeUndefined()
      expect(after.status).toBe("paused")
    }, 60_000)
  })
})
