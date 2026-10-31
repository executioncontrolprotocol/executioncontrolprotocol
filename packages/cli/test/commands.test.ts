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
        "--json",
      ],
      { env }
    )
    expect(res.code).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { schema: string; success: boolean; result?: { echo?: unknown } }
    }
    expect(body.ok).toBe(true)
    expect(body.data.schema).toBe("@executioncontrolprotocol.invoke.result")
    expect(body.data.success).toBe(true)
    expect(body.data.result?.echo).toBe("cli-hi")
  }, 30_000)

  it("run --to then resume and rerun --from --to", async () => {
    const TWO_STEP_WF = "packages/cli/test/fixtures/two-step/workflow.ts"
    const runsDir = join(tmp, "runs")
    const runEnv = { ...env, ECP_RUNS_DIR: runsDir }
    const stopped = await runCli(["run", TWO_STEP_WF, "--to", "first", "--json"], { env: runEnv })
    expect(stopped.code).toBe(0)
    const stoppedBody = JSON.parse(stopped.stdout) as {
      ok: boolean
      data: { run: { id: string; status: string }; history: Record<string, { status: string }> }
    }
    expect(stoppedBody.data.run.status).toBe("stopped")
    expect(stoppedBody.data.history.first?.status).toBe("completed")
    expect(stoppedBody.data.history.second).toBeUndefined()

    const resumed = await runCli(["runs", "resume", stoppedBody.data.run.id, "--json"], { env: runEnv })
    expect(resumed.code).toBe(0)
    const resumedBody = JSON.parse(resumed.stdout) as {
      ok: boolean
      data: {
        run: { id: string; status: string }
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
    }
    expect(resumedBody.data.run.status).toBe("completed")
    expect(resumedBody.data.history.second?.status).toBe("completed")
    expect(resumedBody.data.run.id).not.toBe(stoppedBody.data.run.id)

    const rerun = await runCli(
      ["runs", "rerun", resumedBody.data.run.id, "--from", "first", "--to", "first", "--json"],
      { env: runEnv }
    )
    expect(rerun.code).toBe(0)
    const after = JSON.parse(rerun.stdout) as {
      ok: boolean
      data: {
        run: { status: string }
        history: Record<string, { status: string }>
        state: Record<string, unknown>
      }
    }
    expect(after.data.run.status).toBe("stopped")
    expect(after.data.history.first?.status).toBe("completed")
    expect(after.data.history.second).toBeUndefined()
    expect(after.data.state.second).toBeUndefined()
  }, 60_000)

  it("successful run default stdout is plain text", async () => {
    const res = await runCli(["run", ECHO_WORKFLOW_TS], { env })
    expect(res.code).toBe(0)
    expect(res.stdout).toMatch(/status: completed/)
    expect(res.stdout).toContain("Step echo")
    expect(() => JSON.parse(res.stdout)).toThrow()
  }, 30_000)

  it("failed run prints ECP_* and --json data with history", async () => {
    const failPath = "packages/cli/test/fixtures/fail-ref/workflow.ts"
    const text = await runCli(["run", failPath], { env })
    expect(text.code).toBe(1)
    expect(text.stdout).toMatch(/Run /)
    expect(text.stdout).toContain("status: failed")
    expect(text.stdout).toContain("Step next")
    expect(text.stdout).toContain("Error Code: ECP_REF_UNRESOLVED")
    expect(text.stdout).toContain("Step echo")
    expect(text.stdout).not.toMatch(/STEP FAILED/)

    const json = await runCli(["run", failPath, "--json"], { env })
    expect(json.code).toBe(1)
    const body = JSON.parse(json.stdout) as {
      ok: false
      error: { code: string }
      data: {
        run: { id: string; status: string }
        history: Record<string, { output?: unknown; diagnostics?: { code: string }[] }>
      }
    }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe("ECP_REF_UNRESOLVED")
    expect(body.data.run.status).toBe("failed")
    expect(body.data.history.echo?.output).toEqual({ echo: "hi" })
    expect(body.data.history.next?.diagnostics?.[0]?.code).toBe("ECP_REF_UNRESOLVED")
  }, 30_000)

  it("failed invoke --json includes the execution record", async () => {
    const res = await runCli(
      ["environments", "invoke", "@executioncontrolprotocol/test.does-not-exist", "--json"],
      { env }
    )
    expect(res.code).not.toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: false
      error: { code: string }
      data: { runId: string; stepId: string; diagnostics: { code: string }[] }
    }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe("ECP_CAPABILITY_UNKNOWN")
    expect(body.data.stepId).toBe("invoke")
    expect(body.data.diagnostics[0]?.code).toBe("ECP_CAPABILITY_UNKNOWN")
  }, 30_000)
})
