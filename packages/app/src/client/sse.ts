import type { RunEvent, StorageChange } from "@executioncontrolprotocol/protocol"
import type { FetchLike } from "./api.js"

/**
 * One server-sent event.
 * @category App
 */
export interface SseMessage {
  /** `event:` field; `message` when absent. */
  event: string
  /** `data:` lines joined with `\n`. */
  data: string
  /** `id:` field, when present. */
  id?: string
}

/**
 * Result of {@link parseSseChunk}: complete messages and the unparsed tail.
 * @category App
 */
export interface SseParseResult {
  /** Messages whose blank-line terminator has arrived. */
  messages: SseMessage[]
  /** Incomplete text to prepend to the next chunk. */
  rest: string
}

/**
 * Payload of a `file` event from `/v1/watch?path=`.
 * @category App
 */
export interface SseFileEvent {
  /** Absolute path that changed (the execution or one of its `$script.path` files). */
  path: string
  /** Absolute execution file being watched. */
  executionPath: string
}

/**
 * Callbacks for {@link watchSse}. Comments and heartbeats are never delivered.
 * @category App
 */
export interface SseHandlers {
  /** `storage` event: a run, execution or config changed. */
  onStorage?: (change: StorageChange) => void
  /** `file` event: the watched execution file or one of its scripts changed. */
  onFile?: (event: SseFileEvent) => void
  /** `run` event: one run event, when the host streams them. */
  onRunEvent?: (event: RunEvent) => void
  /** The stream connected. `reconnected` is true after a drop, so callers can resync. */
  onOpen?: (reconnected: boolean) => void
  /** A connection or payload error. The stream keeps reconnecting. */
  onError?: (error: unknown) => void
  /** The host answered 401. The stream stops. */
  onUnauthorized?: () => void
}

/**
 * Options for {@link watchSse}.
 * @category App
 */
export interface WatchSseOptions {
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** First reconnect delay in milliseconds. Default 250. */
  minDelayMs?: number
  /** Reconnect delay cap in milliseconds. Default 5000. */
  maxDelayMs?: number
}

/**
 * Default first reconnect delay for {@link watchSse}.
 * @category App
 */
export const SSE_MIN_DELAY_MS = 250

/**
 * Default reconnect delay cap for {@link watchSse}.
 * @category App
 */
export const SSE_MAX_DELAY_MS = 5000

const DEFAULT_EVENT = "message"

function parseBlock(block: string): SseMessage | undefined {
  let event = DEFAULT_EVENT
  let id: string | undefined
  const data: string[] = []
  let hasField = false
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") {
      event = value || DEFAULT_EVENT
      hasField = true
    } else if (field === "data") {
      data.push(value)
      hasField = true
    } else if (field === "id") {
      id = value
    }
  }
  if (!hasField || data.length === 0) return undefined
  return { event, data: data.join("\n"), ...(id !== undefined ? { id } : {}) }
}

/**
 * Parse buffered server-sent events text. Complete messages (ended by a blank line) are
 * returned; the remainder is kept in `rest`. `\r\n` and `\r` line endings are accepted.
 * Comment-only blocks (`: heartbeat`) and blocks without `data` produce no message.
 * @category App
 */
export function parseSseChunk(buffer: string): SseParseResult {
  const pendingCr = buffer.endsWith("\r")
  const text = (pendingCr ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n")
  const blocks = text.split("\n\n")
  const tail = blocks.pop() ?? ""
  const messages: SseMessage[] = []
  for (const block of blocks) {
    const message = parseBlock(block)
    if (message) messages.push(message)
  }
  return { messages, rest: pendingCr ? `${tail}\r` : tail }
}

/**
 * Reconnect delay for attempt `attempt` (0-based): doubles from `minMs`, capped at `maxMs`.
 * @category App
 */
export function backoffDelay(attempt: number, minMs = SSE_MIN_DELAY_MS, maxMs = SSE_MAX_DELAY_MS): number {
  return Math.min(maxMs, minMs * 2 ** Math.max(0, attempt))
}

/**
 * Deliver one parsed message to the matching handler. Unknown events are ignored.
 * @category App
 */
export function dispatchSseMessage(message: SseMessage, handlers: SseHandlers): void {
  const handler =
    message.event === "storage"
      ? handlers.onStorage
      : message.event === "file"
        ? handlers.onFile
        : message.event === "run"
          ? handlers.onRunEvent
          : undefined
  if (!handler) return
  let payload: unknown
  try {
    payload = JSON.parse(message.data) as unknown
  } catch (error) {
    handlers.onError?.(error)
    return
  }
  ;(handler as (value: unknown) => void)(payload)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })
}

async function readStream(body: ReadableStream<Uint8Array>, handlers: SseHandlers): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseChunk(buffer)
      buffer = parsed.rest
      for (const message of parsed.messages) dispatchSseMessage(message, handlers)
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Follow a server-sent events stream over `fetch` (so the bearer header can be sent;
 * `EventSource` cannot). Reconnects with exponential backoff capped at `maxDelayMs` until
 * `signal` aborts; stops on 401. Resolves once stopped.
 * @category App
 */
export async function watchSse(
  url: string,
  token: string,
  handlers: SseHandlers,
  signal: AbortSignal,
  options: WatchSseOptions = {},
): Promise<void> {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const minMs = options.minDelayMs ?? SSE_MIN_DELAY_MS
  const maxMs = options.maxDelayMs ?? SSE_MAX_DELAY_MS
  let attempt = 0
  let connectedBefore = false
  while (!signal.aborted) {
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal,
      })
      if (response.status === 401) {
        handlers.onUnauthorized?.()
        return
      }
      if (!response.ok || !response.body) {
        throw new Error(`Watch stream answered HTTP ${response.status}.`)
      }
      handlers.onOpen?.(connectedBefore)
      connectedBefore = true
      attempt = 0
      await readStream(response.body, handlers)
    } catch (error) {
      if (signal.aborted) return
      handlers.onError?.(error)
    }
    if (signal.aborted) return
    await sleep(backoffDelay(attempt, minMs, maxMs), signal)
    attempt += 1
  }
}
