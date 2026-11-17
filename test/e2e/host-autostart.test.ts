import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { setTimeout as delay } from "node:timers/promises"
import type { HostFile } from "@executioncontrolprotocol/protocol"
import {
  assertCliBuilt,
  createCliHome,
  parseJsonStdout,
  runEcp,
  waitForHost,
} from "./cli/support.js"
import { isPidAlive } from "./host-process-shared.js"

function isAlive(pid: number): boolean {
  return isPidAlive(pid)
}

describe("host auto-start and idle shutdown", () => {
  it("auto-starts on first retrieve and reuses on the second", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    const first = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env })
    expect(first.code).toBe(0)
    expect(first.stderr).toMatch(/^host: started http:\/\/127\.0\.0\.1:\d+ \(idle 15m\)/m)

    const hostJson = path.join(home, "host.json")
    expect(existsSync(hostJson)).toBe(true)
    const file = JSON.parse(readFileSync(hostJson, "utf8")) as HostFile
    expect(file.startedBy).toBe("auto")

    const second = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env })
    expect(second.code).toBe(0)
    expect(second.stderr).not.toMatch(/host: started/)

    const file2 = JSON.parse(readFileSync(hostJson, "utf8")) as HostFile
    expect(file2.supervisorPid).toBe(file.supervisorPid)
  }, 120_000)

  it("opts out with --no-start-host and ECP_NO_START_HOST", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    const flag = await runEcp(
      ["retrieve", "--type", "capability", "--query", "echo", "--no-start-host", "--json"],
      { env },
    )
    expect(flag.code).toBe(0)
    expect(existsSync(path.join(home, "host.json"))).toBe(false)

    const { env: env2, home: home2 } = await createCliHome({ autoStartHost: false })
    const out = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], { env: env2 })
    expect(out.code).toBe(0)
    expect(existsSync(path.join(home2, "host.json"))).toBe(false)
  }, 120_000)

  it("idle-stops after ECP_HOST_IDLE_MS", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    env.ECP_HOST_IDLE_MS = "2500"
    const run = await runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env })
    expect(run.code).toBe(0)
    await waitForHost(home)
    const hostJsonPath = path.join(home, "host.json")
    const file = JSON.parse(readFileSync(hostJsonPath, "utf8")) as HostFile
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline && existsSync(hostJsonPath)) {
      await delay(500)
    }
    expect(existsSync(hostJsonPath)).toBe(false)
    expect(isAlive(file.supervisorPid)).toBe(false)
    expect(isAlive(file.hostPid)).toBe(false)
  }, 120_000)

  it("host status down does not auto-start", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ autoStartHost: true })
    const status = await runEcp(["host", "status", "--json"], { env })
    expect(status.code).toBe(4)
    const envelope = parseJsonStdout<{ ok: boolean }>(status.stdout)
    expect(envelope.ok).toBe(false)
  }, 60_000)

  it("host reload restarts a healthy auto-started host", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    await runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env })
    await waitForHost(home)
    const reload = await runEcp(["host", "reload", "--json"], { env })
    expect(reload.code).toBe(0)
    await waitForHost(home)
  }, 120_000)

  it("parallel cold retrieves share one supervisor", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    const [a, b] = await Promise.all([
      runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env }),
      runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env }),
    ])
    expect(a.code).toBe(0)
    expect(b.code).toBe(0)
    const file = JSON.parse(readFileSync(path.join(home, "host.json"), "utf8")) as HostFile
    expect(existsSync(path.join(home, "supervisor.pid"))).toBe(true)
    expect(file.startedBy).toBe("auto")
  }, 120_000)

  it("defers idle stop while a delay run is active", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    env.ECP_HOST_IDLE_MS = "2000"
    const manifest = path.join(home, "delay.ecp.json")
    writeFileSync(
      manifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "wait", uses: "@executioncontrolprotocol/test.delay", input: { ms: 4000 }, as: "out" }],
      })}\n`,
    )
    await runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env })
    await waitForHost(home)
    const run = await runEcp(["execute", manifest, "--no-wait", "--json"], { env })
    expect(run.code).toBe(0)
    await delay(2500)
    expect(existsSync(path.join(home, "host.json"))).toBe(true)
    await delay(5000)
    const deadline = Date.now() + 20_000
    const hostJsonPath = path.join(home, "host.json")
    while (Date.now() < deadline && existsSync(hostJsonPath)) await delay(500)
    expect(existsSync(hostJsonPath)).toBe(false)
  }, 180_000)

  it("exits 4 when ECP_HOST_ENTRY fails", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ autoStartHost: true })
    const failEntry = path.join(home, "fail-host.cjs")
    writeFileSync(failEntry, "process.exit(1);\n")
    env.ECP_HOST_ENTRY = failEntry
    const run = await runEcp(["retrieve", "--type", "capability", "--limit", "1", "--json"], { env })
    expect(run.code).toBe(4)
    expect(run.stderr + run.stdout).toMatch(/ECP_HOST_UNAVAILABLE/)
    await delay(3000)
    const hostJsonPath = path.join(home, "host.json")
    if (existsSync(hostJsonPath)) {
      const leftover = JSON.parse(readFileSync(hostJsonPath, "utf8")) as HostFile
      expect(isAlive(leftover.supervisorPid)).toBe(false)
      expect(isAlive(leftover.hostPid)).toBe(false)
    }
  }, 120_000)
})