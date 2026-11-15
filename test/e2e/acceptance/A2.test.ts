import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  fixturesRoot,
  parseJsonStdout,
  runEcp,
  waitForHost,
} from "./support.js"

describe("A2 all-features execute", () => {
  const stoppers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (stoppers.length > 0) await stoppers.pop()?.()
  })

  it("ecp execute acceptance/all-features matches run fixture and writes run files", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    // Warm host so event batches flush (in-process CLI exits via process.exit before close).
    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    stoppers.push(async () => {
      await runEcp(["host", "stop", "--force", "--json"], { env })
    })
    await waitForHost(home)

    const execPath = path.join(fixturesRoot, "manifests/acceptance/all-features.ecp.json")
    const expected = JSON.parse(
      readFileSync(path.join(fixturesRoot, "manifests/acceptance/all-features.run.json"), "utf8"),
    ) as {
      status: string
      result: Record<string, unknown>
      steps: Record<string, string>
      events: string[]
    }

    const inputPath = path.join(home, "in.json")
    writeFileSync(inputPath, `${JSON.stringify({ name: "world" })}\n`)

    const result = await runEcp(
      ["execute", execPath, "--input", `@${inputPath}`, "--json"],
      { env, timeoutMs: 90_000 },
    )
    expect(result.code, result.stderr + result.stdout).toBe(0)
    const envelope = parseJsonStdout<{
      ok: boolean
      data: {
        runId: string
        status: string
        result?: Record<string, unknown>
        steps?: Array<{ nodeId: string; status: string }>
      }
    }>(result.stdout)
    expect(envelope.ok).toBe(true)
    expect(envelope.data.status).toBe(expected.status)
    expect(envelope.data.result).toMatchObject(expected.result)
    for (const [nodeId, status] of Object.entries(expected.steps)) {
      expect(
        envelope.data.steps?.find((step) => step.nodeId === nodeId)?.status,
        `step ${nodeId}`,
      ).toBe(status)
    }

    const runId = envelope.data.runId
    const runDir = path.join(home, "runs", runId)
    expect(existsSync(path.join(runDir, "run.json"))).toBe(true)
    expect(existsSync(path.join(runDir, "events.ndjson"))).toBe(true)
    const stepFiles = readdirSync(path.join(runDir, "steps")).filter((name) => name.endsWith(".json"))
    expect(stepFiles.length).toBeGreaterThan(0)

    const runRecord = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as {
      status: string
    }
    expect(runRecord.status).toBe("completed")

    const events = readFileSync(path.join(runDir, "events.ndjson"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string })
    expect(events[0]?.type).toBe("run.start")
    expect(events.at(-1)?.type).toBe("run.end")
    const types = events.map((event) => event.type)
    for (const type of expected.events) {
      expect(types).toContain(type)
    }
  }, 120_000)
})
