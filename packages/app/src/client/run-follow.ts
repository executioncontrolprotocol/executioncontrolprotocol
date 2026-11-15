import type { RunDetail, RunEvent } from "@executioncontrolprotocol/protocol"
import { HostRequestError, UnauthorizedError, type AppHostClient } from "./api.js"
import { newRunEvents, retrieveItem } from "./results.js"
import { watchSse, type WatchSseOptions } from "./sse.js"

/**
 * Callbacks for {@link followRun}.
 * @category App
 */
export interface FollowRunHandlers {
  /** One new run event, in `seq` order, never repeated. */
  onEvent: (event: RunEvent) => void
  /** The run left `running`. Called once, after every event was delivered. */
  onDone: (detail: RunDetail) => void
  /** A request failed. Following continues unless the token was rejected. */
  onError?: (error: unknown) => void
  /** The host rejected the token. Following stops. */
  onUnauthorized?: () => void
}

/**
 * Options for {@link followRun}.
 * @category App
 */
export interface FollowRunOptions {
  /** Poll interval while the run is active, in milliseconds. Default 300. */
  pollMs?: number
  /** Options passed to the watch stream. */
  sse?: Omit<WatchSseOptions, "fetch">
}

/**
 * Default poll interval for {@link followRun}.
 * @category App
 */
export const RUN_POLL_MS = 300

/**
 * Follow one run until it ends: watches `/v1/watch?types=run&runId=` and polls the run's
 * events (storage notifies on record changes, not on every event), delivering each new
 * event once. Resolves when the run ends, the token is rejected, or `signal` aborts.
 * @category App
 */
export function followRun(
  client: AppHostClient,
  runId: string,
  handlers: FollowRunHandlers,
  signal: AbortSignal,
  options: FollowRunOptions = {},
): Promise<void> {
  const inner = new AbortController()
  const stop = (): void => inner.abort()
  if (signal.aborted) return Promise.resolve()
  signal.addEventListener("abort", stop, { once: true })

  let lastSeq = 0
  let inFlight = false
  let queued = false

  const fail = (error: unknown): void => {
    if (inner.signal.aborted) return
    if (error instanceof UnauthorizedError) {
      handlers.onUnauthorized?.()
      stop()
      return
    }
    handlers.onError?.(error)
  }

  const refreshOnce = async (): Promise<void> => {
    const response = await client.retrieve({ type: "run", id: runId, include: ["events"] })
    if (inner.signal.aborted) return
    if (!response.ok) {
      fail(new HostRequestError(response.error, 0))
      return
    }
    const detail = retrieveItem<RunDetail>(response)
    if (!detail) return
    for (const event of newRunEvents(detail.events ?? [], lastSeq)) {
      lastSeq = event.seq
      handlers.onEvent(event)
    }
    if (detail.status !== "running") {
      stop()
      handlers.onDone(detail)
    }
  }

  const refresh = async (): Promise<void> => {
    if (inner.signal.aborted) return
    if (inFlight) {
      queued = true
      return
    }
    inFlight = true
    try {
      do {
        queued = false
        await refreshOnce()
      } while (queued && !inner.signal.aborted)
    } catch (error) {
      fail(error)
    } finally {
      inFlight = false
    }
  }

  const timer = setInterval(() => void refresh(), options.pollMs ?? RUN_POLL_MS)
  const done = new Promise<void>((resolve) => {
    inner.signal.addEventListener(
      "abort",
      () => {
        clearInterval(timer)
        signal.removeEventListener("abort", stop)
        resolve()
      },
      { once: true },
    )
  })

  void watchSse(
    client.watchUrl({ types: ["run"], runId }),
    client.token,
    {
      onOpen: () => void refresh(),
      onStorage: () => void refresh(),
      onRunEvent: () => void refresh(),
      onUnauthorized: () => fail(new UnauthorizedError()),
    },
    inner.signal,
    { ...options.sse, fetch: client.fetch },
  )

  return done
}
