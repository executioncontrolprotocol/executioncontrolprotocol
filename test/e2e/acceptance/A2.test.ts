import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  fixturesRoot,
  parseJsonStdout,
  runEcp,
} from "./support.js"

describe("A2 all-features execute", () => {
  it("ecp execute acceptance/all-features matches run fixture and writes run files", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()

    const execPath = path.join(fixturesRoot, "manifests/acceptance/all-features.ecp.json")
    const expected = JSON.parse(
      readFileSync(path.join(fixturesRoot, "manifests/acceptance/all-features.run.json"), "utf8"),
    ) as {
      status: string
      result: Record<string, unknown>
      steps: Record<string, string>
      events: string[]
    }

    const configPath = path.join(home, "all-features-config.json")
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "lab" },
        objectVersion: 0,
        updatedAt: "",
      })}\n`,
    )
    const configCommit = await runEcp(
      ["commit", "--type", "config", "--action", "create", "--object", `@${configPath}`, "--json"],
      { env },
    )
    expect(configCommit.code, configCommit.stderr + configCommit.stdout).toBe(0)

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
      host?: { pid: number; mode: string }
    }
    expect(runRecord.status).toBe("completed")
    expect(runRecord.host?.mode).toBe("in-process")
    expect(runRecord.host?.pid).toBeGreaterThanOrEqual(1)

    const events = readFileSync(path.join(runDir, "events.ndjson"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string })
    expect(events[0]?.type).toBe("run.start")
    expect(events.at(-1)?.type).toBe("run.end")
    const types = events.map((event) => event.type)
    expect(types).toEqual(expected.events)
  }, 120_000)
})
