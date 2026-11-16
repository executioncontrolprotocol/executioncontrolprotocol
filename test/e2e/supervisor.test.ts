import { spawn } from "node:child_process"
import { chmodSync, existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { describe, expect, it } from "vitest"
import type { HostFile } from "@executioncontrolprotocol/protocol"
import { checkHealth, readHostJson } from "../../packages/host/src/index.js"
import { registerCliHome, registerDirectHostProcess } from "./host-processes.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const supervisorEntry = path.join(repoRoot, "packages/host/dist/supervisor.js")

async function startSupervisor(home: string): Promise<ReturnType<typeof spawn>> {
  registerCliHome(home)
  const child = spawn(process.execPath, [supervisorEntry], {
    env: { ...process.env, ECP_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  if (child.pid) await registerDirectHostProcess(child.pid, "supervisor", home)
  return child
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForHostOk(home: string, timeoutMs = 30_000): Promise<HostFile> {
  const file = await waitFor(() => readHostJson(home), timeoutMs)
  await waitFor(async () => {
    const next = await checkHealth(`http://127.0.0.1:${file!.port}`)
    return next?.status === "ok" ? next : undefined
  }, timeoutMs)
  return file!
}

describe("supervisor e2e", () => {
  it("control /stop leaves both pids dead", async () => {
    expect(existsSync(supervisorEntry)).toBe(true)
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    expect(hostFile.supervisorPid).toBe(child.pid)

    const stop = await fetch(`http://127.0.0.1:${hostFile.controlPort}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hostFile.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    })
    expect(stop.ok).toBe(true)
    await waitFor(() => (!isAlive(hostFile.hostPid) && !isAlive(hostFile.supervisorPid) ? true : undefined), 15_000)
    expect(readHostJson(home)).toBeUndefined()
  }, 60_000)

  it("deleting host.json stops the pair within one orphan poll", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    unlinkSync(path.join(home, "host.json"))
    await waitFor(
      () =>
        !isAlive(hostFile.hostPid) && !isAlive(hostFile.supervisorPid) && child.exitCode !== null
          ? true
          : undefined,
      10_000,
    )
  }, 30_000)

  it("deleting ECP_HOME stops the pair within one orphan poll", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    rmSync(home, { recursive: true, force: true })
    await waitFor(
      () =>
        !isAlive(hostFile.hostPid) && !isAlive(hostFile.supervisorPid) && child.exitCode !== null
          ? true
          : undefined,
      10_000,
    )
  }, 30_000)

  it("rewrite host.json with a different token stops the pair", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    const tampered: HostFile = { ...hostFile, token: `${hostFile.token}x` }
    writeFileSync(path.join(home, "host.json"), `${JSON.stringify(tampered, null, 2)}\n`)
    await waitFor(
      () => (!isAlive(hostFile.hostPid) && !isAlive(hostFile.supervisorPid) ? true : undefined),
      10_000,
    )
    // The exiting supervisor must not delete a host.json that now belongs to another host.
    const remaining = JSON.parse(readFileSync(path.join(home, "host.json"), "utf8")) as HostFile
    expect(remaining.token).toBe(tampered.token)
  }, 30_000)

  it("same token and supervisorPid leaves the supervisor running", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    writeFileSync(path.join(home, "host.json"), `${JSON.stringify(hostFile, null, 2)}\n`)
    await delay(5_500)
    expect(isAlive(child.pid!)).toBe(true)
    expect(isAlive(hostFile.hostPid)).toBe(true)
    const stop = await fetch(`http://127.0.0.1:${hostFile.controlPort}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hostFile.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    })
    expect(stop.ok).toBe(true)
  }, 30_000)

  it("SIGKILL supervisor; host dies within parent poll", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = await startSupervisor(home)
    const hostFile = await waitForHostOk(home)
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" })
    } else {
      process.kill(child.pid!, "SIGKILL")
    }
    await waitFor(() => (!isAlive(hostFile.hostPid) ? true : undefined), 10_000)
  }, 30_000)

  it.skipIf(process.platform === "win32")(
    "a single unreadable host.json poll does not exit; readable rewrite does",
    async () => {
      const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
      const child = await startSupervisor(home)
      const hostFile = await waitForHostOk(home)
      const hostJson = path.join(home, "host.json")
      chmodSync(hostJson, 0o000)
      await delay(2_500)
      expect(isAlive(child.pid!)).toBe(true)
      chmodSync(hostJson, 0o600)
      const tampered: HostFile = { ...hostFile, token: `${hostFile.token}y` }
      writeFileSync(hostJson, `${JSON.stringify(tampered, null, 2)}\n`)
      await waitFor(
        () => (!isAlive(hostFile.hostPid) && !isAlive(hostFile.supervisorPid) ? true : undefined),
        10_000,
      )
    },
    30_000,
  )
})

async function waitFor<T>(fn: () => T | Promise<T | undefined> | undefined, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value) return value
    await delay(100)
  }
  throw new Error("waitFor timed out")
}