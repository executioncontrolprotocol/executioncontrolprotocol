import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import type {
  CommitInput,
  ExecuteData,
  ExecuteInput,
  OperationResponse,
  RetrieveData,
  RetrieveInput,
  RunStatus,
} from "@executioncontrolprotocol/protocol"
import { ensureHost, waitForHealthyHost, type EnsureHostOptions, type EnsuredHost } from "./host.js"
import { relayLog } from "./log.js"
import { resolveCommitPaths, resolveExecutePaths, resolveRetrievePaths } from "./paths.js"

const RESTART_WAIT_MS = 30_000
const HEALTH_POLL_MS = 250

/**
 * Forward retrieve with host ensure, path resolution, and restart retry.
 * @category MCP
 */
export async function forwardRetrieve(
  options: EnsureHostOptions & { cwd: string },
  raw: RetrieveInput,
): Promise<OperationResponse<RetrieveData>> {
  const input = resolveRetrievePaths(raw, options.cwd)
  return withRetry(options, (host) => host.client.retrieve(input))
}

/**
 * Forward commit with host ensure and restart retry.
 * @category MCP
 */
export async function forwardCommit(
  options: EnsureHostOptions & { cwd: string },
  raw: CommitInput,
): Promise<OperationResponse<unknown>> {
  const input = resolveCommitPaths(raw, options.cwd)
  return withRetry(options, (host) => host.client.commit(input))
}

/**
 * Forward execute: mint clientRequestId, retry/restart, recover by id on drop.
 * @category MCP
 */
export async function forwardExecute(
  options: EnsureHostOptions & { cwd: string },
  raw: ExecuteInput,
): Promise<OperationResponse<ExecuteData>> {
  const input = resolveExecutePaths(raw, options.cwd)
  const clientRequestId =
    input.clientRequestId ??
    (input.resume || input.cancel ? undefined : randomUUID())
  const payload: ExecuteInput = clientRequestId ? { ...input, clientRequestId } : input

  try {
    return await withRetry(options, (host) => host.client.execute(payload), {
      onDrop: clientRequestId
        ? async (host) => recoverExecute(host, clientRequestId)
        : undefined,
    })
  } catch (error) {
    if (clientRequestId && isConnectionError(error)) {
      const host = await waitForHealthyHost(options.home, RESTART_WAIT_MS)
      if (host) {
        const recovered = await recoverExecute(host, clientRequestId)
        if (recovered) return recovered
      }
    }
    throw error
  }
}

async function withRetry<T>(
  options: EnsureHostOptions,
  call: (host: EnsuredHost) => Promise<OperationResponse<T>>,
  extras?: { onDrop?: (host: EnsuredHost) => Promise<OperationResponse<T> | undefined> },
): Promise<OperationResponse<T>> {
  const host = await ensureHost(options)
  try {
    const first = await call(host)
    if (isRestarting(first)) {
      relayLog(options.home, "host restarting; waiting then retrying once")
      const ready = await waitForHealthyHost(options.home, RESTART_WAIT_MS)
      if (!ready) return first
      return call(ready)
    }
    return first
  } catch (error) {
    if (!isConnectionError(error)) throw error
    relayLog(options.home, `connection error: ${String(error)}; waiting for host`)
    const ready = await waitForHealthyHost(options.home, RESTART_WAIT_MS)
    if (!ready) throw error
    if (extras?.onDrop) {
      const recovered = await extras.onDrop(ready)
      if (recovered) return recovered
    }
    return call(ready)
  }
}

async function recoverExecute(
  host: EnsuredHost,
  clientRequestId: string,
): Promise<OperationResponse<ExecuteData> | undefined> {
  // Brief settle so the run record is visible after restart.
  for (let i = 0; i < 20; i++) {
    const listed = await host.client.retrieve({
      type: "run",
      filter: { clientRequestId },
      limit: 1,
    })
    if (listed.ok && listed.data.type === "run" && "items" in listed.data) {
      const item = listed.data.items[0] as
        | { id?: string; status?: string; runId?: string }
        | undefined
      if (item) {
        const runId = item.id ?? item.runId
        if (runId) {
          const detail = await host.client.retrieve({ type: "run", id: runId })
          if (detail.ok && detail.data.type === "run" && "item" in detail.data) {
            const record = detail.data.item as {
              id: string
              status: RunStatus
              result?: Record<string, unknown>
            }
            const data: ExecuteData = {
              runId: record.id,
              status: record.status,
              validation: { valid: true, issues: [], manifestHash: "", schemaHash: "" },
              result: record.result,
              steps: [],
            }
            return { ok: true, data }
          }
        }
      }
    }
    await delay(HEALTH_POLL_MS)
  }
  return undefined
}

function isRestarting(envelope: OperationResponse<unknown>): boolean {
  return !envelope.ok && envelope.error.code === "ECP_HOST_RESTARTING"
}

/**
 * Whether an error looks like a dropped HTTP connection.
 * @category MCP
 */
export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const err = error as { code?: string; cause?: { code?: string }; message?: string }
  const code = err.code ?? err.cause?.code
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE" || code === "UND_ERR_SOCKET") {
    return true
  }
  const message = String(err.message ?? error)
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket/i.test(message)
}
