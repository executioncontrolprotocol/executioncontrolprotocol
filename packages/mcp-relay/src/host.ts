import { spawn } from "node:child_process"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { checkHealth, HostClient, readHostJson } from "@executioncontrolprotocol/host/client"
import type { HostFile, SupervisorStatus } from "@executioncontrolprotocol/protocol"
import { relayLog } from "./log.js"

const START_WAIT_MS = 15_000
const HEALTH_POLL_MS = 250
const RESTART_WAIT_MS = 30_000

/**
 * A healthy host bound for HTTP operations.
 * @category MCP
 */
export interface EnsuredHost {
  /** HTTP client. */
  client: HostClient
  /** Absolute home. */
  home: string
  /** Live host.json. */
  hostFile: HostFile
  /** Base URL. */
  url: string
}

/**
 * Options for ensuring a warm host.
 * @category MCP
 */
export interface EnsureHostOptions {
  /** Absolute ECP_HOME. */
  home: string
  /** Absolute path to the ecp CLI bin (`.js`). */
  ecpBin: string
}

/**
 * Ensure a healthy host, starting `ecp host start` when needed.
 * @category MCP
 */
export async function ensureHost(options: EnsureHostOptions): Promise<EnsuredHost> {
  // If a supervisor already wrote host.json, wait through restart gaps before starting another.
  const hasHostFile = Boolean(readHostJson(options.home))
  const existing = await tryHealthy(options.home, hasHostFile ? Math.max(START_WAIT_MS, RESTART_WAIT_MS) : HEALTH_POLL_MS)
  if (existing) return existing

  const failed = await readSupervisorFailed(options.home)
  if (failed) {
    throw unavailable(options.home, "Supervisor hostStatus is failed.")
  }

  // Live supervisor that never became healthy — do not double-spawn.
  const leftover = readHostJson(options.home)
  if (leftover && (await controlAlive(leftover))) {
    throw unavailable(options.home, "Host did not become healthy (existing supervisor).")
  }

  await startHostViaCli(options)
  const after = await tryHealthy(options.home, START_WAIT_MS)
  if (!after) {
    const againFailed = await readSupervisorFailed(options.home)
    throw unavailable(
      options.home,
      againFailed ? "Supervisor hostStatus is failed." : "Host did not become healthy after ecp host start.",
    )
  }
  return after
}

async function controlAlive(file: { controlPort: number; token: string }): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${file.controlPort}/status`, {
      headers: { Authorization: `Bearer ${file.token}` },
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Poll until health is ok (for restart waits).
 * @category MCP
 */
export async function waitForHealthyHost(home: string, timeoutMs = RESTART_WAIT_MS): Promise<EnsuredHost | undefined> {
  return tryHealthy(home, timeoutMs)
}

async function tryHealthy(home: string, waitMs = HEALTH_POLL_MS): Promise<EnsuredHost | undefined> {
  const deadline = Date.now() + waitMs
  while (Date.now() <= deadline) {
    const file = readHostJson(home)
    if (file) {
      const url = `http://127.0.0.1:${file.port}`
      const health = await checkHealth(url)
      if (health?.status === "ok") {
        return { client: new HostClient(url, file.token), home, hostFile: file, url }
      }
      if (health?.status === "draining") {
        // Keep polling within the same budget.
      }
    }
    await delay(HEALTH_POLL_MS)
  }
  return undefined
}

async function startHostViaCli(options: EnsureHostOptions): Promise<void> {
  relayLog(options.home, `starting host via ${options.ecpBin} host start`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [options.ecpBin, "host", "start", "--started-by", "auto", "--json"], {
      env: { ...process.env, ECP_HOME: options.home },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(Object.assign(new Error(`ecp host start exited ${code}: ${stderr}`), { code: "ECP_HOST_UNAVAILABLE" }))
    })
  })
}

async function readSupervisorFailed(home: string): Promise<boolean> {
  const file = readHostJson(home)
  if (!file) return false
  try {
    const response = await fetch(`http://127.0.0.1:${file.controlPort}/status`, {
      headers: { Authorization: `Bearer ${file.token}` },
    })
    if (!response.ok) return false
    const status = (await response.json()) as SupervisorStatus
    return status.hostStatus === "failed"
  } catch {
    return false
  }
}

function unavailable(home: string, detail: string): Error {
  const hostLog = path.join(home, "logs", "host.log")
  const supervisorLog = path.join(home, "logs", "supervisor.log")
  return Object.assign(
    new Error(`ECP_HOST_UNAVAILABLE: ${detail} See ${hostLog} and ${supervisorLog}.`),
    {
      code: "ECP_HOST_UNAVAILABLE",
      suggestions: [`Check ${hostLog}`, `Check ${supervisorLog}`, "Run ecp host start"],
    },
  )
}
