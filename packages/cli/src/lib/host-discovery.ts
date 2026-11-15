import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import {
  checkHealth,
  createLocalHost,
  HostClient,
  readHostJson,
  type LocalHost,
} from "@executioncontrolprotocol/host"
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
 * @category CLI
 */
export async function startSupervisorDetached(home: string): Promise<void> {
  const existing = readHostJson(home)
  if (existing) {
    const health = await checkHealth(`http://127.0.0.1:${existing.port}`)
    if (health?.status === "ok" || health?.status === "draining") return
  }
  const supervisorEntry = resolveSupervisorEntry()
  const child = spawn(process.execPath, [supervisorEntry], {
    env: { ...process.env, ECP_HOME: home },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()
  const deadline = Date.now() + START_WAIT_MS
  while (Date.now() < deadline) {
    const file = readHostJson(home)
    if (file) {
      const health = await checkHealth(`http://127.0.0.1:${file.port}`)
      if (health?.status === "ok") return
    }
    await delay(100)
  }
  throw Object.assign(new Error("ECP_HOST_UNAVAILABLE: supervisor did not become healthy."), {
    code: "ECP_HOST_UNAVAILABLE",
  })
}

function resolveSupervisorEntry(): string {
  try {
    return fileURLToPath(import.meta.resolve("@executioncontrolprotocol/host/supervisor"))
  } catch {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, "../../../host/dist/supervisor.js")
  }
}
