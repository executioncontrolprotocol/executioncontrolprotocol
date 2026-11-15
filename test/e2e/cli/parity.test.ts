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

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === "runId" ||
        key === "startedAt" ||
        key === "endedAt" ||
        key === "durationMs" ||
        key === "timing" ||
        key === "updatedAt" ||
        key === "createdAt"
      ) {
        continue
      }
      out[key] = stripVolatile(entry)
    }
    return out
  }
  return value
}

describe("cli A9 warm vs in-process parity", () => {
  const stoppers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (stoppers.length > 0) await stoppers.pop()?.()
  })

  it("A1–A5 ops return the same data warm and in-process", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const echoPath = path.join(fixturesRoot, "manifests/runs/echo.ecp.json")
    const invalid = path.join(fixturesRoot, "manifests/invalid/unknown-capability.ecp.json")

    const inProcessOps = async (): Promise<unknown[]> => {
      const retrieve = parseJsonStdout(
        (
          await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env })
        ).stdout,
      )
      const execute = parseJsonStdout((await runEcp(["execute", echoPath, "--json"], { env })).stdout)
      const validate = parseJsonStdout(
        (await runEcp(["execute", invalid, "--validate", "--json"], { env })).stdout,
      )
      return [retrieve, execute, validate]
    }

    const cold = (await inProcessOps()).map(stripVolatile)

    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    stoppers.push(async () => {
      await runEcp(["host", "stop", "--force", "--json"], { env })
    })
    await waitForHost(home)

    const warm = (await inProcessOps()).map(stripVolatile)
    expect(warm).toEqual(cold)
  }, 180_000)
})
