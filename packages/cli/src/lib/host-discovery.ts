import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { checkHealth, HostClient, readHostJson } from "@executioncontrolprotocol/host/client"
import type { LocalHost } from "@executioncontrolprotocol/host"
import type { HostStartedBy } from "@executioncontrolprotocol/protocol"
import type { CommitData, CommitInput, ExecuteData, ExecuteInput, OperationResponse, RetrieveData, RetrieveInput } from "@executioncontrolprotocol/protocol"
import { ecpHome } from "./home.js"

const HEALTH_BUDGET_MS = 500
const DRAIN_WAIT_MS = 30_000
const START_WAIT_MS = 15_000
const DEFAULT_IDLE_MINUTES = 15

let tipPrinted = false

/**
 * Unified operations surface for warm HTTP or in-process host.
 * @category CLI
 */
export interface OpsHandle {
  /** How the ops were obtained. */
  mode: "http" | "in-process"
  /** Run retrieve. */
  retrieve(input: RetrieveInput): Promise<OperationResponse<RetrieveData>>
  /** Run execute. */
  execute(input: ExecuteInput): Promise<OperationResponse<ExecuteData>>
  /** Run commit. */
  commit(input: CommitInput): Promise<OperationResponse<CommitData>>
  /** Release in-process resources. */
  close(): Promise<void>
  /** Bound host URL when warm. */
  url?: string
  /** Host token when warm. */
  token?: string
  /** Listen port when warm. */
  port?: number
}

/**
 * Options for {@link discoverOps}.
 * @category CLI
 */
export interface DiscoverOpsOptions {
  /** When `false`, never auto-start a supervisor (still uses a healthy host). Default: honor env unless set. */
  autoStart?: boolean
  home?: string
  extraPlugins?: string[]
}

/**
 * Options for {@link startSupervisorDetached}.
 * @category CLI
 */
export interface StartSupervisorOptions {
  /** Recorded on host.json (`auto` default for discovery). */
  startedBy?: HostStartedBy
  /** Idle minutes for this supervisor (`0` = never). */
  idleMinutes?: number
}

/**
 * Discover a host for operations (spec 10).
 * @category CLI
 */
export async function discoverOps(options: DiscoverOpsOptions = {}): Promise<OpsHandle> {
  const ops = await discoverOnce(options)
  if (ops.mode !== "http") return ops
  return retryOnceIfHostStops(ops, () => discoverOnce(options))
}

/**
 * A warm host can begin an idle shutdown between discovery and the request, and then refuses
 * new work with ECP_HOST_RESTARTING (or the connection drops). Rediscover once, which waits out
 * the drain and starts a fresh host when allowed, and resend the same request.
 * @category CLI
 */
export function retryOnceIfHostStops(ops: OpsHandle, rediscover: () => Promise<OpsHandle>): OpsHandle {
  const withRetry = <I, D>(call: (handle: OpsHandle) => (input: I) => Promise<OperationResponse<D>>) =>
    async (input: I): Promise<OperationResponse<D>> => {
      let response: OperationResponse<D> | undefined
      try {
        response = await call(ops)(input)
        if (response.ok || response.error.code !== "ECP_HOST_RESTARTING") return response
      } catch (error) {
        if (!isConnectionError(error)) throw error
      }
      const fresh = await rediscover()
      try {
        return await call(fresh)(input)
      } finally {
        if (fresh !== ops) await fresh.close()
      }
    }
  return {
    ...ops,
    retrieve: withRetry((handle) => handle.retrieve),
    execute: withRetry((handle) => handle.execute),
    commit: withRetry((handle) => handle.commit),
  }
}

function isConnectionError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code ?? (error as { code?: string })?.code
  return code === "ECONNREFUSED" || code === "ECONNRESET" || (error instanceof TypeError && /fetch failed/i.test(error.message))
}

async function discoverOnce(options: DiscoverOpsOptions): Promise<OpsHandle> {
  const home = options.home ?? ecpHome()
  const warm = await tryWarm(home)
  if (warm) return warm

  const optOut = noStartHostEnv() || options.autoStart === false
  if (optOut) {
    return inProcessHost(home, options.extraPlugins)
  }

  try {
    const start = await startSupervisorDetached(home, { startedBy: "auto" })
    const after = await tryWarm(home, START_WAIT_MS)
    if (!after) throw hostUnavailable(home, "supervisor did not become healthy.")
    if (start.spawned && after.url) {
      // Report the idle timeout the running supervisor recorded, not this process's defaults.
      const idleMinutes = readHostJson(home)?.idleMinutes ?? start.idleMinutes
      const idleLabel = idleMinutes === 0 ? "never" : `${idleMinutes}m`
      process.stderr.write(`host: started ${after.url} (idle ${idleLabel})\n`)
    }
    return after
  } catch (error) {
    if (isHostUnavailable(error)) throw error
    throw hostUnavailable(home, error instanceof Error ? error.message : "start failed.")
  }
}

/**
 * Ensure a warm host is running (for `ecp app` / MCP relay). Ignores `ECP_NO_START_HOST`.
 * @category CLI
 */
export async function ensureWarmHost(home = ecpHome()): Promise<{
  client: HostClient
  url: string
  token: string
  port: number
}> {
  const existing = await tryWarm(home)
  if (existing?.mode === "http" && existing.url && existing.token && existing.port) {
    return {
      client: new HostClient(existing.url, existing.token),
      url: existing.url,
      token: existing.token,
      port: existing.port,
    }
  }
  await startSupervisorDetached(home, { startedBy: "auto" })
  const warm = await tryWarm(home, START_WAIT_MS)
  if (!warm?.url || !warm.token || !warm.port) {
    throw hostUnavailable(home, "could not start a warm host.")
  }
  return {
    client: new HostClient(warm.url, warm.token),
    url: warm.url,
    token: warm.token,
    port: warm.port,
  }
}

async function inProcessHost(home: string, extraPlugins?: string[]): Promise<OpsHandle> {
  const { createLocalHost } = await import("@executioncontrolprotocol/host")
  const host = await createLocalHost({
    home,
    mode: "in-process",
    extraPlugins,
  })
  if (!tipPrinted) {
    process.stderr.write(
      'tip: run "ecp host start" to keep a warm host and make commands faster (or clear ECP_NO_START_HOST)\n',
    )
    tipPrinted = true
  }
  return wrapInProcess(host)
}

async function tryWarm(home: string, waitMs = HEALTH_BUDGET_MS): Promise<OpsHandle | undefined> {
  const file = readHostJson(home)
  if (!file) return undefined
  const baseUrl = `http://127.0.0.1:${file.port}`
  const deadline = Date.now() + waitMs
  while (Date.now() <= deadline) {
    const health = await checkHealth(baseUrl)
    if (health?.status === "ok") {
      const client = new HostClient(baseUrl, file.token)
      return {
        mode: "http",
        retrieve: (input) => client.retrieve(input),
        execute: (input) => client.execute(input),
        commit: (input) => client.commit(input),
        close: async () => undefined,
        url: baseUrl,
        token: file.token,
        port: file.port,
      }
    }
    if (health?.status === "draining") {
      const drainDeadline = Date.now() + DRAIN_WAIT_MS
      while (Date.now() < drainDeadline) {
        await delay(250)
        const again = await checkHealth(baseUrl)
        if (again?.status === "ok") {
          const client = new HostClient(baseUrl, file.token)
          return {
            mode: "http",
            retrieve: (input) => client.retrieve(input),
            execute: (input) => client.execute(input),
            commit: (input) => client.commit(input),
            close: async () => undefined,
            url: baseUrl,
            token: file.token,
            port: file.port,
          }
        }
        if (!again) break
      }
      return undefined
    }
    await delay(50)
  }
  return undefined
}

function wrapInProcess(host: LocalHost): OpsHandle {
  return {
    mode: "in-process",
    retrieve: (input) => host.operations.retrieve(input),
    execute: (input) => host.operations.execute(input),
    commit: (input) => host.operations.commit(input),
    close: () => host.stop(),
  }
}

/**
 * Spawn the supervisor entry detached and wait briefly for `host.json`.
 * @category CLI
 */
export async function startSupervisorDetached(
  home: string,
  options: StartSupervisorOptions = {},
): Promise<{ spawned: boolean; idleMinutes: number }> {
  const existing = await waitForExistingSupervisor(home, START_WAIT_MS)
  if (existing === "ok") {
    const file = readHostJson(home)
    return { spawned: false, idleMinutes: file?.idleMinutes ?? resolveIdleMinutesFromEnv() }
  }
  if (existing === "alive-unhealthy") {
    throw hostUnavailable(home, "existing host did not become healthy.")
  }

  const idleMinutes = options.idleMinutes ?? resolveIdleMinutesFromEnv()
  const supervisorEntry = resolveSupervisorEntry()
  const child = spawn(process.execPath, [supervisorEntry], {
    env: {
      ...process.env,
      ECP_HOME: home,
      ECP_HOST_STARTED_BY: options.startedBy ?? "explicit",
      ECP_HOST_IDLE_MINUTES: String(idleMinutes),
    },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()
  const ready = await waitForHostOk(home, START_WAIT_MS)
  if (ready) return { spawned: true, idleMinutes }
  throw hostUnavailable(home, "supervisor did not become healthy.")
}

/** Outcome of waiting on an existing supervisor before deciding whether to spawn. */
type ExistingSupervisorWait = "ok" | "alive-unhealthy" | "absent"

async function waitForExistingSupervisor(home: string, timeoutMs: number): Promise<ExistingSupervisorWait> {
  const file = readHostJson(home)
  if (!file) return "absent"

  const deadline = Date.now() + timeoutMs
  const graceUntil = Date.now() + 2_000
  let sawLiveControl = false
  while (Date.now() < deadline) {
    const current = readHostJson(home)
    if (!current) return "absent"
    const health = await checkHealth(`http://127.0.0.1:${current.port}`)
    if (health?.status === "ok") return "ok"
    if (await controlResponds(current)) {
      sawLiveControl = true
      await delay(100)
      continue
    }
    if (sawLiveControl || Date.now() < graceUntil) {
      await delay(100)
      continue
    }
    return "absent"
  }
  const last = readHostJson(home)
  if (!last) return "absent"
  if ((await checkHealth(`http://127.0.0.1:${last.port}`))?.status === "ok") return "ok"
  if (await controlResponds(last)) return "alive-unhealthy"
  return "absent"
}

async function waitForHostOk(home: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const file = readHostJson(home)
    if (file) {
      const health = await checkHealth(`http://127.0.0.1:${file.port}`)
      if (health?.status === "ok") return true
    }
    await delay(100)
  }
  return false
}

async function controlResponds(file: { controlPort: number; token: string }): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${file.controlPort}/status`, {
      headers: { Authorization: `Bearer ${file.token}` },
    })
    return response.ok
  } catch {
    return false
  }
}

function resolveSupervisorEntry(): string {
  try {
    return fileURLToPath(import.meta.resolve("@executioncontrolprotocol/host/supervisor"))
  } catch {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, "../../../host/dist/supervisor.js")
  }
}

function resolveIdleMinutesFromEnv(): number {
  const raw = process.env.ECP_HOST_IDLE_MINUTES
  if (raw !== undefined && raw !== "") {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return DEFAULT_IDLE_MINUTES
}

function noStartHostEnv(): boolean {
  const value = process.env.ECP_NO_START_HOST
  if (!value) return false
  return value === "1" || value.toLowerCase() === "true"
}

function hostUnavailable(home: string, detail: string): Error {
  const hostLog = path.join(home, "logs", "host.log")
  const supervisorLog = path.join(home, "logs", "supervisor.log")
  return Object.assign(new Error(`ECP_HOST_UNAVAILABLE: ${detail} See ${hostLog} and ${supervisorLog}.`), {
    code: "ECP_HOST_UNAVAILABLE",
    suggestions: [`Check ${hostLog}`, `Check ${supervisorLog}`, "Run ecp host start"],
  })
}

function isHostUnavailable(error: unknown): error is Error & { code: string } {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ECP_HOST_UNAVAILABLE")
}