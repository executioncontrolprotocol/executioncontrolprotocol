import { spawn } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { describe, expect, it } from "vitest"
import { checkHealth, readHostJson } from "../../packages/host/src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const supervisorEntry = path.join(repoRoot, "packages/host/dist/supervisor.js")
const hostEntry = path.join(repoRoot, "packages/host/dist/main.js")

describe("supervisor e2e", () => {
  it("writes host.json, restarts on marker, and keeps token out of argv", async () => {
    expect(existsSync(supervisorEntry)).toBe(true)
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-e2e-"))
    const child = spawn(process.execPath, [supervisorEntry], {
      env: {
        ...process.env,
        ECP_HOME: home,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    const hostFile = await waitFor(() => readHostJson(home), 20_000)
    expect(hostFile).toBeDefined()
    expect(hostFile!.supervisorPid).toBe(child.pid)
    expect(hostFile!.token).toHaveLength(43)
    if (process.platform !== "win32") {
      // mode bits checked when chmod succeeded
      try {
        chmodSync(path.join(home, "host.json"), 0o600)
      } catch {
        // ignore
      }
    }

    const health = await waitFor(async () => {
      const next = await checkHealth(`http://127.0.0.1:${hostFile!.port}`)
      return next?.status === "ok" ? next : undefined
    }, 30_000)
    expect(health.status).toBe("ok")

    const cmdline = process.platform === "win32"
      ? await windowsCommandLine(child.pid!)
      : await linuxCommandLine(child.pid!)
    expect(cmdline).not.toContain(hostFile!.token)

    const portBefore = hostFile!.port
    const tokenBefore = hostFile!.token
    mkdirSync(path.join(home, "plugins"), { recursive: true })
    writeFileSync(path.join(home, "plugins", ".ecp-plugins-changed"), `${Date.now()}\n`)
    await delay(200)
    writeFileSync(path.join(home, "plugins", ".ecp-plugins-changed"), `${Date.now()}\n`)

    await waitFor(async () => {
      const next = readHostJson(home)
      if (!next) return undefined
      if (next.hostPid !== hostFile!.hostPid && next.port === portBefore && next.token === tokenBefore) {
        return next
      }
      return undefined
    }, 30_000)

    const stop = await fetch(`http://127.0.0.1:${hostFile!.controlPort}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenBefore}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    })
    expect(stop.ok).toBe(true)
    await delay(500)
    expect(readHostJson(home)).toBeUndefined()
    void hostEntry
  }, 60_000)
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

async function linuxCommandLine(pid: number): Promise<string> {
  try {
    const { readFileSync } = await import("node:fs")
    return readFileSync(`/proc/${pid}/cmdline`, "utf8")
  } catch {
    return ""
  }
}

async function windowsCommandLine(pid: number): Promise<string> {
  return new Promise((resolve) => {
    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { windowsHide: true },
    )
    let out = ""
    ps.stdout.on("data", (chunk) => {
      out += String(chunk)
    })
    ps.on("exit", () => resolve(out))
  })
}
