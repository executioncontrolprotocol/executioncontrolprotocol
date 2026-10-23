import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const cliBin = join(repoRoot, "packages/cli/bin/run.js")

const ECHO_WORKFLOW_TS = "examples/01-echo/workflow.ecp.ts"
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

function runCli(args: string[], env?: NodeJS.ProcessEnv): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, env: env ?? process.env },
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

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ecp-cli-"))
    brokenWorkflowPath = join(tmp, "broken.json")
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
      const res = await runCli(["validate", ECHO_WORKFLOW_TS])
      expect(res.code).toBe(0)
      const result = JSON.parse(res.stdout) as { valid: boolean }
      expect(result.valid).toBe(true)
    }, 30_000)

    it("exits non-zero for an unknown capability", async () => {
      const res = await runCli(["validate", brokenWorkflowPath])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("run", () => {
    it("exits non-zero when the workflow cannot run", async () => {
      const res = await runCli(["run", brokenWorkflowPath])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("describe", () => {
    it("returns a descriptor including the echo capability", async () => {
      const res = await runCli(["describe"])
      expect(res.code).toBe(0)
      const descriptor = JSON.parse(res.stdout) as { capabilities: { id: string }[] }
      expect(descriptor.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
    }, 30_000)

    it("prints the --json envelope", async () => {
      const res = await runCli(["describe", "--json"])
      expect(res.code).toBe(0)
      const body = JSON.parse(res.stdout) as { ok: boolean; data: { capabilities: { id: string }[] } }
      expect(body.ok).toBe(true)
      expect(body.data.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
    }, 30_000)
  })

  describe("search", () => {
    it("returns search results for a query", async () => {
      const res = await runCli(["search", "echo"])
      expect(res.code).toBe(0)
      const result = JSON.parse(res.stdout) as { results: unknown[] }
      expect(Array.isArray(result.results)).toBe(true)
    }, 30_000)
  })

  describe("invoke", () => {
    it("invokes a bound capability and prints InvokeResult", async () => {
      const inputPath = join(tmp, "invoke-input.json")
      await writeFile(inputPath, JSON.stringify({ value: "cli-hi" }), "utf8")
      const res = await runCli([
        "invoke",
        "@executioncontrolprotocol/test.echo",
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
      ])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("runs", () => {
    const TWO_STEP_WF = "packages/cli/test/fixtures/two-step/workflow.ts"

    it("run --to then resume and rerun --from --to", async () => {
      const runsDir = join(tmp, "runs")
      const env = { ...process.env, ECP_RUNS_DIR: runsDir }
      const stopped = await runCli(["run", TWO_STEP_WF, "--to", "first"], env)
      expect(stopped.code).toBe(0)
      const stoppedBody = JSON.parse(stopped.stdout) as {
        run: { id: string; status: string }
        history: Record<string, { status: string }>
      }
      expect(stoppedBody.run.status).toBe("stopped")
      expect(stoppedBody.history.first?.status).toBe("completed")
      expect(stoppedBody.history.second).toBeUndefined()

      const resumed = await runCli(["runs", "resume", stoppedBody.run.id], env)
      expect(resumed.code).toBe(0)
      const resumedBody = JSON.parse(resumed.stdout) as {
        run: { id: string; status: string }
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
      expect(resumedBody.run.status).toBe("completed")
      expect(resumedBody.history.second?.status).toBe("completed")
      expect(resumedBody.run.id).not.toBe(stoppedBody.run.id)

      const rerun = await runCli(
        ["runs", "rerun", resumedBody.run.id, "--from", "first", "--to", "first"],
        env
      )
      expect(rerun.code).toBe(0)
      const after = JSON.parse(rerun.stdout) as {
        run: { status: string }
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
      expect(after.run.status).toBe("stopped")
      expect(after.history.first?.status).toBe("completed")
      expect(after.history.second).toBeUndefined()
      expect(after.state.second).toBeUndefined()
    }, 60_000)
  })
})
