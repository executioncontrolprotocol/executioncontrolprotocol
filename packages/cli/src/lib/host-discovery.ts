import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { checkHealth, HostClient, readHostJson } from "@executioncontrolprotocol/host/client"
import type { LocalHost } from "@executioncontrolprotocol/host"
import type { CommitData, CommitInput, ExecuteData, ExecuteInput, OperationResponse, RetrieveData, RetrieveInput } from "@executioncontrolprotocol/protocol"
import { ecpHome } from "./home.js"

const HEALTH_BUDGET_MS = 500
const DRAIN_WAIT_MS = 30_000
const START_WAIT_MS = 15_000

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
 * Discover a host for operations (spec 10).
 * @category CLI
 */
export async function discoverOps(options: {
  startHost?: boolean
  home?: string
  extraPlugins?: string[]
}): Promise<OpsHandle> {
  const home = options.home ?? ecpHome()
  const warm = await tryWarm(home)
  if (warm) return warm

  if (options.startHost) {
    await startSupervisorDetached(home)
    const after = await tryWarm(home, START_WAIT_MS)
    if (after) return after
    throw Object.assign(new Error("ECP_HOST_UNAVAILABLE: host did not become healthy after start."), {
      code: "ECP_HOST_UNAVAILABLE",
    })
  }

  const { createLocalHost } = await import("@executioncontrolprotocol/host")
  const host = await createLocalHost({
    home,
    mode: "in-process",
    extraPlugins: options.extraPlugins,
  })
  if (!tipPrinted) {
    process.stderr.write('tip: run "ecp host start" to keep a warm host and make commands faster\n')
    tipPrinted = true
  }
  return wrapInProcess(host)
}

/**
 * Ensure a warm host is running (for `ecp app` / schema).
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
  await startSupervisorDetached(home)
  const warm = await tryWarm(home, START_WAIT_MS)
  if (!warm?.url || !warm.token || !warm.port) {
    throw Object.assign(new Error("ECP_HOST_UNAVAILABLE: could not start a warm host."), {
      code: "ECP_HOST_UNAVAILABLE",
    })
  }
  return {
    client: new HostClient(warm.url, warm.token),
    url: warm.url,
    token: warm.token,
    port: warm.port,
  }
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
 * If a live supervisor already owns `host.json`, wait through restart gaps instead of
 * starting a second supervisor. Stale `host.json` (control port dead) is replaced.
 * @category CLI
 */
export async function startSupervisorDetached(home: string): Promise<void> {
  const existing = await waitForExistingSupervisor(home, START_WAIT_MS)
  if (existing === "ok") return
  if (existing === "alive-unhealthy") {
    throw Object.assign(
      new Error("ECP_HOST_UNAVAILABLE: existing host did not become healthy."),
      { code: "ECP_HOST_UNAVAILABLE" },
    )
  }

  const supervisorEntry = resolveSupervisorEntry()
  const child = spawn(process.execPath, [supervisorEntry], {
    env: { ...process.env, ECP_HOME: home },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()
  const ready = await waitForHostOk(home, START_WAIT_MS)
  if (ready) return
  throw Object.assign(new Error("ECP_HOST_UNAVAILABLE: supervisor did not become healthy."), {
    code: "ECP_HOST_UNAVAILABLE",
  })
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
    // Restart gap can briefly drop HTTP and control; keep waiting if we saw life or still in grace.
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
