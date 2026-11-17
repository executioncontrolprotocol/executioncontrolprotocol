#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  watch as fsWatch,
  type FSWatcher,
} from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import os from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { atomicWriteText } from "@executioncontrolprotocol/local"
import {
  HOST_SCHEMA,
  HOST_VERSION,
  type HostFile,
  type SupervisorStatus,
} from "@executioncontrolprotocol/protocol"
import { isAllowedHost, tokensEqual } from "./auth/local-token-auth.js"
import { checkHealth } from "./client/check-health.js"
import { HostClient } from "./client/host-client.js"
import { readHostJson } from "./client/read-host-json.js"
import { openRotatingLog } from "./log-rotate.js"
import { allocateLoopbackPort } from "./ports.js"
import { generateHostToken } from "./token.js"
import { VERSION } from "./version.js"

const HEALTH_WAIT_MS = 15_000
const MARKER_DEBOUNCE_MS = 500
const MARKER_POLL_MS = 2_000
const SHUTDOWN_WAIT_MS = 5_000
const CRASH_WINDOW_MS = 10 * 60_000
const CRASH_LIMIT = 10
const HEALTHY_RESET_MS = 60_000
const MAX_ADDRINUSE_RETRIES = 3

/**
 * Options for {@link runSupervisor}.
 * @category Host
 */
export interface SupervisorOptions {
  /** Absolute `ECP_HOME`. */
  home: string
  /** Plugin data dir (marker watch). Default `$home/plugins`. */
  dataDir?: string
  /** Path to host `main.js`. Default sibling of this module. */
  hostEntry?: string
}

/**
 * Supervisor process: spawn host, write host.json, control port, restart protocol.
 * @category Host
 */
export async function runSupervisor(options: SupervisorOptions): Promise<void> {
  const home = path.resolve(options.home)
  mkdirSync(path.join(home, "logs"), { recursive: true })
  const existing = readHostJson(home)
  if (existing && isProcessAlive(existing.supervisorPid)) {
    return
  }

  const dataDir = options.dataDir ?? path.join(home, "plugins")
  mkdirSync(dataDir, { recursive: true })
  const hostEntry =
    options.hostEntry ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "main.js")
  const log = openRotatingLog(path.join(home, "logs", "supervisor.log"))
  const writeLog = (line: string): void => {
    // Never log the token.
    log.write(`${new Date().toISOString()} ${line}\n`)
  }

  let port = await allocateLoopbackPort()
  const controlPort = await allocateLoopbackPort()
  const token = generateHostToken()
  let hostPid: number | null = null
  let hostChild: ChildProcess | undefined
  let hostStatus: SupervisorStatus["hostStatus"] = "starting"
  let restarts = 0
  let lastRestartReason: string | undefined
  const crashTimes: number[] = []
  let healthySince: number | undefined
  let backoffMs = 1000
  let stopping = false
  let ignoringExit = false
  const writeHostFile = async (pid: number): Promise<void> => {
    const file: HostFile = {
      schema: HOST_SCHEMA,
      version: HOST_VERSION,
      supervisorPid: process.pid,
      hostPid: pid,
      port,
      controlPort,
      token,
      hostVersion: VERSION,
      startedAt: new Date().toISOString(),
      home,
    }
    const target = path.join(home, "host.json")
    await atomicWriteText(target, `${JSON.stringify(file, null, 2)}\n`)
    if (process.platform !== "win32") {
      try {
        chmodSync(target, 0o600)
      } catch {
        // best effort
      }
    }
  }

  const status = (): SupervisorStatus => ({
    supervisorPid: process.pid,
    hostPid,
    hostStatus,
    restarts,
    lastRestartReason,
  })

  const spawnHost = async (): Promise<void> => {
    hostStatus = "starting"
    const hostLog = openRotatingLog(path.join(home, "logs", "host.log"))
    ignoringExit = true
    hostChild = spawn(process.execPath, [hostEntry], {
      env: {
        ...process.env,
        ECP_HOME: home,
        ECP_HOST_PORT: String(port),
        ECP_HOST_TOKEN: token,
        ECP_SUPERVISOR_PID: String(process.pid),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    hostChild.stdout?.pipe(hostLog)
    hostChild.stderr?.pipe(hostLog)
    hostPid = hostChild.pid ?? null
    if (hostPid) await writeHostFile(hostPid)

    const earlyExit = await Promise.race([
      new Promise<number | null>((resolve) => {
        hostChild!.once("exit", (code) => resolve(code))
      }),
      delay(300).then(() => null as null),
    ])
    if (earlyExit === 70) {
      throw Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" })
    }
    if (earlyExit !== null) {
      throw new Error(`Host exited early with code ${earlyExit}`)
    }

    const baseUrl = `http://127.0.0.1:${port}`
    const deadline = Date.now() + HEALTH_WAIT_MS
    while (Date.now() < deadline) {
      const health = await checkHealth(baseUrl)
      if (health?.status === "ok" || health?.status === "draining") {
        hostStatus = "healthy"
        healthySince = Date.now()
        backoffMs = 1000
        ignoringExit = false
        hostChild.on("exit", (code) => onHostExit(code))
        return
      }
      if (hostChild.exitCode !== null) {
        throw new Error(`Host exited during health wait with code ${hostChild.exitCode}`)
      }
      await delay(100)
    }
    throw new Error("Host health wait timed out.")
  }

  const startHostWithAddrRetry = async (): Promise<void> => {
    for (let attempt = 0; attempt < MAX_ADDRINUSE_RETRIES; attempt++) {
      try {
        await spawnHost()
        return
      } catch (error) {
        if ((error as { code?: string }).code === "EADDRINUSE") {
          port = await allocateLoopbackPort()
          writeLog(`EADDRINUSE; retrying on port ${port}`)
          continue
        }
        throw error
      }
    }
    throw new Error("EADDRINUSE retries exhausted.")
  }

  const drainAndShutdown = async (force: boolean): Promise<void> => {
    hostStatus = "draining"
    ignoringExit = true
    const client = new HostClient(`http://127.0.0.1:${port}`, token)
    try {
      await client.drain(force ? 0 : 30_000)
    } catch {
      writeLog("drain failed")
    }
    try {
      await client.shutdown()
    } catch {
      writeLog("shutdown request failed")
    }
    const child = hostChild
    if (child && child.exitCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        delay(SHUTDOWN_WAIT_MS),
      ])
      if (child.exitCode === null) {
        child.kill()
        await delay(200)
      }
    }
    hostChild = undefined
    hostPid = null
  }

  const restart = async (reason: string, force = false): Promise<void> => {
    if (stopping || hostStatus === "failed") return
    lastRestartReason = reason
    restarts += 1
    writeLog(`restart reason=${reason}`)
    await drainAndShutdown(force)
    await startHostWithAddrRetry()
  }

  const onHostExit = (code: number | null): void => {
    if (stopping || ignoringExit || hostStatus === "failed") return
    writeLog(`host exited code=${code}`)
    const now = Date.now()
    crashTimes.push(now)
    while (crashTimes.length > 0 && now - crashTimes[0]! > CRASH_WINDOW_MS) crashTimes.shift()
    if (healthySince && now - healthySince >= HEALTHY_RESET_MS) {
      backoffMs = 1000
    }
    if (crashTimes.length > CRASH_LIMIT) {
      hostStatus = "failed"
      writeLog("crash loop; giving up")
      return
    }
    const wait = backoffMs
    backoffMs = Math.min(backoffMs * 2, 30_000)
    void delay(wait).then(() => restart("crash"))
  }

  const controlServer = createServer((req, res) => {
    void handleControl(req, res)
  })
  await listen(controlServer, controlPort)

  async function handleControl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const headers = flattenHeaders(req.headers)
    const authorization = headers.authorization
    const hostHeader = headers.host
    const okAuth =
      authorization?.startsWith("Bearer ") &&
      tokensEqual(authorization.slice("Bearer ".length), token) &&
      hostHeader !== undefined &&
      isAllowedHost(hostHeader, controlPort)
    if (!okAuth) {
      res.statusCode = 401
      res.end(JSON.stringify({ ok: false, error: { code: "ECP_UNAUTHORIZED", message: "Unauthorized." } }))
      return
    }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${controlPort}`)
    if (req.method === "GET" && url.pathname === "/status") {
      res.statusCode = 200
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.end(`${JSON.stringify(status())}\n`)
      return
    }
    if (req.method === "POST" && url.pathname === "/restart") {
      const body = await readBody(req)
      const force = Boolean((body as { force?: boolean }).force)
      void restart("control-restart", force)
      res.statusCode = 200
      res.end(`${JSON.stringify({ ok: true, data: {} })}\n`)
      return
    }
    if (req.method === "POST" && url.pathname === "/stop") {
      const body = await readBody(req)
      const force = Boolean((body as { force?: boolean }).force)
      stopping = true
      await drainAndShutdown(force)
      try {
        unlinkSync(path.join(home, "host.json"))
      } catch {
        // missing is fine
      }
      res.statusCode = 200
      res.end(`${JSON.stringify({ ok: true, data: {} })}\n`)
      controlServer?.close()
      log.end()
      process.exit(0)
      return
    }
    res.statusCode = 404
    res.end(
      `${JSON.stringify({ ok: false, error: { code: "ECP_NOT_FOUND", message: "Unknown control route." } })}\n`,
    )
  }

  await startHostWithAddrRetry()

  const markerPath = path.join(dataDir, ".ecp-plugins-changed")
  let debounce: ReturnType<typeof setTimeout> | undefined
  let lastMarkerMtime = existsSync(markerPath) ? statSync(markerPath).mtimeMs : -1
  const scheduleRestart = (): void => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      void restart("plugins-changed")
    }, MARKER_DEBOUNCE_MS)
  }
  let markerWatcher: FSWatcher | undefined
  try {
    markerWatcher = fsWatch(dataDir, (_event, filename) => {
      if (!filename || filename === ".ecp-plugins-changed") scheduleRestart()
    })
  } catch {
    // poll covers it
  }
  const orphanForceExit = async (): Promise<void> => {
    if (stopping) return
    stopping = true
    writeLog("orphan safety net: home or host.json invalid; force exit")
    clearInterval(poll)
    markerWatcher?.close()
    await drainAndShutdown(true)
    // Remove host.json only while it is still ours; a newer host may own it now.
    try {
      const hostJsonPath = path.join(home, "host.json")
      const current = JSON.parse(readFileSync(hostJsonPath, "utf8")) as HostFile
      if (current.token === token && current.supervisorPid === process.pid) unlinkSync(hostJsonPath)
    } catch {
      // missing or unreadable: nothing of ours to remove
    }
    controlServer?.close()
    log.end()
    process.exit(0)
  }

  // Confirm the first two healthy polls after host.json is (re)written in the log (tests wait on
  // these lines); otherwise a healthy poll is silent so a long-running host's log doesn't grow every 2 s.
  let keptLogsLeft = 0
  let lastHostJsonMtime = -1
  const checkOrphanSafetyNet = (): void => {
    if (stopping) return
    if (!existsSync(home)) {
      void orphanForceExit()
      return
    }
    const hostJsonPath = path.join(home, "host.json")
    if (!existsSync(hostJsonPath)) {
      void orphanForceExit()
      return
    }
    try {
      const parsed = JSON.parse(readFileSync(hostJsonPath, "utf8")) as HostFile
      if (parsed.token !== token || parsed.supervisorPid !== process.pid) {
        void orphanForceExit()
        return
      }
      const mtime = statSync(hostJsonPath).mtimeMs
      if (mtime !== lastHostJsonMtime) {
        lastHostJsonMtime = mtime
        keptLogsLeft = 2
      }
      if (keptLogsLeft > 0) {
        keptLogsLeft -= 1
        writeLog("orphan poll: host.json kept")
      }
    } catch {
      writeLog("orphan poll: host.json unreadable, will retry")
    }
  }

  const poll = setInterval(() => {
    checkOrphanSafetyNet()
    if (!existsSync(markerPath)) return
    try {
      const mtime = statSync(markerPath).mtimeMs
      if (mtime !== lastMarkerMtime) {
        lastMarkerMtime = mtime
        scheduleRestart()
      }
    } catch {
      // ignore
    }
  }, MARKER_POLL_MS)

  writeLog(`supervisor ready control=${controlPort} host=${port}`)

  const stopAll = async (): Promise<void> => {
    stopping = true
    clearInterval(poll)
    markerWatcher?.close()
    await drainAndShutdown(false)
    try {
      unlinkSync(path.join(home, "host.json"))
    } catch {
      // ignore
    }
    controlServer?.close()
    log.end()
  }
  process.on("SIGINT", () => {
    void stopAll().then(() => process.exit(0))
  })
  process.on("SIGTERM", () => {
    void stopAll().then(() => process.exit(0))
  })
  process.on("exit", () => {
    const child = hostChild
    if (child && child.exitCode === null) {
      child.kill()
    }
  })

  await new Promise(() => undefined)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => resolve())
  })
}

function flattenHeaders(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
  }
  return out
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    return {}
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const home = path.resolve(process.env.ECP_HOME ?? path.join(os.homedir(), ".ecp"))
  void runSupervisor({ home }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
