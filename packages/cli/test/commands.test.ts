import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { join } from "node:path"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { hermeticCliEnv, hermeticWithPluginTest, runCli } from "./helpers.js"

const ECHO_WORKFLOW_TS = "examples/01-echo/workflow.ecp.ts"
const BROKEN_WORKFLOW = JSON.stringify({
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "broken" },
  steps: [{ type: "step", id: "x", uses: "@executioncontrolprotocol/test.does-not-exist", input: {}, as: "x" }],
})

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
      const res = await runCli(["workflows", "compile", ECHO_WORKFLOW_TS])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(res.stdout) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("writes the manifest to -o output file", async () => {
      const out = join(tmp, "compiled.json")
      const res = await runCli(["workflows", "compile", ECHO_WORKFLOW_TS, "-o", out])
      expect(res.code).toBe(0)
      const manifest = JSON.parse(await readFile(out, "utf8")) as { schema: string }
      expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    }, 30_000)

    it("fails on a missing source file", async () => {
      const res = await runCli(["workflows", "compile", "does/not/exist.ts"])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("validate", () => {
    it("exits non-zero for an unknown capability", async () => {
      const res = await runCli(["workflows", "validate", brokenWorkflowPath])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("removed top-level commands", () => {
    it("does not find ecp compile at the root", async () => {
      const res = await runCli(["compile", ECHO_WORKFLOW_TS, "--json"])
      expect(res.code).not.toBe(0)
    }, 30_000)

    it("rejects environments export --format dockerfile", async () => {
      const res = await runCli(["environments", "export", "--format", "dockerfile", "--json"])
      expect(res.code).not.toBe(0)
      const raw = `${res.stdout}\n${res.stderr}`
      expect(raw).toMatch(/ECP_INPUT_INVALID|dockerfile|Expected|enum/i)
    }, 30_000)
  })

  describe("run", () => {
    it("exits non-zero when the workflow cannot run", async () => {
      const res = await runCli(["run", brokenWorkflowPath])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })

  describe("describe without plugin-test", () => {
    it("does not list test.echo on a hermetic process host", async () => {
      const hermetic = await hermeticCliEnv()
      try {
        const res = await runCli(["environments", "describe"], { env: hermetic.env })
        expect(res.code).toBe(0)
        const descriptor = JSON.parse(res.stdout) as { capabilities: { id: string }[] }
        expect(
          descriptor.capabilities.some((c) => c.id === "@executioncontrolprotocol/test.echo")
        ).toBe(false)
      } finally {
        await rm(hermetic.dir, { recursive: true, force: true })
      }
    }, 30_000)

    it("exits non-zero when the capability is missing", async () => {
      const res = await runCli([
        "environments",
        "invoke",
        "@executioncontrolprotocol/test.does-not-exist",
      ])
      expect(res.code).not.toBe(0)
    }, 30_000)
  })
})

describe("ecp CLI commands with plugin-test linked", () => {
  let home: string
  let env: NodeJS.ProcessEnv
  let tmp: string

  beforeAll(async () => {
    const hermetic = await hermeticWithPluginTest()
    home = hermetic.dir
    env = hermetic.env
    tmp = await mkdtemp(join(tmpdir(), "ecp-cli-linked-"))
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(tmp, { recursive: true, force: true })
  })

  it("validates a workflow that uses plugin-test", async () => {
    const res = await runCli(["workflows", "validate", ECHO_WORKFLOW_TS], { env })
    expect(res.code).toBe(0)
    const result = JSON.parse(res.stdout) as { valid: boolean }
    expect(result.valid).toBe(true)
  }, 30_000)

  it("returns a descriptor including the echo capability", async () => {
    const res = await runCli(["environments", "describe"], { env })
    expect(res.code).toBe(0)
    const descriptor = JSON.parse(res.stdout) as { capabilities: { id: string }[] }
    expect(descriptor.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
  }, 30_000)

  it("prints the --json envelope", async () => {
    const res = await runCli(["environments", "describe", "--json"], { env })
    expect(res.code).toBe(0)
    const body = JSON.parse(res.stdout) as { ok: boolean; data: { capabilities: { id: string }[] } }
    expect(body.ok).toBe(true)
    expect(body.data.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
  }, 30_000)

  it("returns search results for a query", async () => {
    const res = await runCli(["environments", "search", "echo"], { env })
    expect(res.code).toBe(0)
    const result = JSON.parse(res.stdout) as { results: unknown[] }
    expect(Array.isArray(result.results)).toBe(true)
  }, 30_000)

  it("invokes a bound capability and prints InvokeResult", async () => {
    const inputPath = join(tmp, "invoke-input.json")
    await writeFile(inputPath, JSON.stringify({ value: "cli-hi" }), "utf8")
    const res = await runCli(
      [
        "environments",
        "invoke",
        "@executioncontrolprotocol/test.echo",
        "--input",
        inputPath,
      ],
      { env }
    )
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

  it("run --to then resume and rerun --from --to", async () => {
    const TWO_STEP_WF = "packages/cli/test/fixtures/two-step/workflow.ts"
    const runsDir = join(tmp, "runs")
    const runEnv = { ...env, ECP_RUNS_DIR: runsDir }
    const stopped = await runCli(["run", TWO_STEP_WF, "--to", "first"], { env: runEnv })
    expect(stopped.code).toBe(0)
    const stoppedBody = JSON.parse(stopped.stdout) as {
      run: { id: string; status: string }
      history: Record<string, { status: string }>
    }
    expect(stoppedBody.run.status).toBe("stopped")
    expect(stoppedBody.history.first?.status).toBe("completed")
    expect(stoppedBody.history.second).toBeUndefined()

    const resumed = await runCli(["runs", "resume", stoppedBody.run.id], { env: runEnv })
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
      { env: runEnv }
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
