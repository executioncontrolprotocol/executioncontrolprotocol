import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { join } from "node:path"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { hermeticWithPluginTest, runCli } from "./helpers.js"

const ACCEPTS_WORKFLOW = "examples/07-accepts-returns/workflow.ecp.ts"
const ACCEPTS_INPUT = "examples/07-accepts-returns/input.json"

describe("ecp run workflow source", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticWithPluginTest()
    home = hermetic.dir
    env = hermetic.env
  }, 60_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("runs .ts workflow without pre-compiling to json", async () => {
    const res = await runCli(["run", "examples/01-echo/workflow.ecp.ts", "--json"], { env })
    expect(res.code).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { run: { status: string }; state?: { echo: unknown } }
    }
    expect(body.ok).toBe(true)
    expect(body.data.run.status).toBe("completed")
    expect(body.data.state?.echo).toEqual({ echo: "hello from fluent API" })
  }, 30_000)

  it("runs accepts/returns example with --input", async () => {
    const res = await runCli(["run", ACCEPTS_WORKFLOW, "--input", ACCEPTS_INPUT, "--json"], { env })
    expect(res.code).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: { run: { status: string }; output?: { echo?: unknown } }
    }
    expect(body.ok).toBe(true)
    expect(body.data.run.status).toBe("completed")
    expect(body.data.output?.echo).toEqual({ echo: "hello from input" })
  }, 30_000)

  it("exits non-zero when --input fails accepts validation", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "ecp-accepts-"))
    const badInput = join(tmp, "bad.json")
    await writeFile(badInput, JSON.stringify({ value: 1 }), "utf8")
    try {
      const res = await runCli(["run", ACCEPTS_WORKFLOW, "--input", badInput], { env })
      expect(res.code).not.toBe(0)
      expect(`${res.stderr}\n${res.stdout}`).toMatch(/accepts validation failed/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }, 30_000)

  it("dry-run with valid input completes without executing steps", async () => {
    const res = await runCli(
      ["run", ACCEPTS_WORKFLOW, "--input", ACCEPTS_INPUT, "--dry-run", "--json"],
      { env }
    )
    expect(res.code).toBe(0)
    const body = JSON.parse(res.stdout) as {
      ok: boolean
      data: {
        run: { id: string; status: string }
        state?: Record<string, unknown>
        history?: unknown
      }
    }
    expect(body.ok).toBe(true)
    expect(body.data.run.status).toBe("completed")
    expect(body.data.run.id).toBe("dry-run")
    expect(body.data.state).toEqual({ value: "hello from input" })
    expect(body.data.history).toBeUndefined()
  }, 30_000)

  it("dry-run with missing required input exits non-zero", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "ecp-accepts-dry-"))
    const emptyInput = join(tmp, "empty.json")
    await writeFile(emptyInput, JSON.stringify({}), "utf8")
    try {
      const res = await runCli(
        ["run", ACCEPTS_WORKFLOW, "--input", emptyInput, "--dry-run"],
        { env }
      )
      expect(res.code).not.toBe(0)
      expect(`${res.stderr}\n${res.stdout}`).toMatch(/accepts validation failed/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }, 30_000)
})
