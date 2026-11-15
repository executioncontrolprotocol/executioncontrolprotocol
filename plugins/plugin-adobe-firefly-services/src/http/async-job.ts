import { AdobeServiceError, PROVIDER_ERROR } from "../errors.js"
import { abortReason, sleep } from "../runtime/abort.js"
import { redactUrl, type AdobeHttpClient } from "./client.js"

/**
 * Default delay between status checks.
 * @category Http
 */
export const DEFAULT_POLL_INTERVAL_MS = 2000

/**
 * Default longest wait for a job (just under the async capability timeout).
 * @category Http
 */
export const DEFAULT_POLL_TIMEOUT_MS = 570_000

const SUCCESS_STATUSES = new Set(["succeeded", "success", "completed", "done", "partially_succeeded", "partialsuccess"])
const FAILURE_STATUSES = new Set(["failed", "error", "cancelled", "canceled"])
const ERROR_FIELDS = ["error", "errors", "message", "reason", "details"] as const

/**
 * Options for {@link pollAdobeJob}.
 * @category Http
 */
export interface PollAdobeJobOptions {
  /** Absolute status URL from the submit response. */
  statusUrl: string
  /** Authenticated client. */
  client: AdobeHttpClient
  /** Aborts the wait and the in-flight status request. */
  signal?: AbortSignal
  /** Delay between checks. Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  intervalMs?: number
  /** Longest wait. Defaults to {@link DEFAULT_POLL_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Clock. Defaults to `Date.now`. */
  now?: () => number
}

const HTTP_URL = /^https?:\/\//i

function httpUrl(value: unknown): string | undefined {
  return typeof value === "string" && HTTP_URL.test(value) ? value : undefined
}

/**
 * Find the status URL in an async submit response. Covers `statusUrl`, Substance's `url`,
 * HAL `_links.self`, and `links` records (Firefly marks the result link with `type: "result"`).
 * @category Http
 */
export function extractAdobeStatusUrl(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined
  const record = body as Record<string, unknown>

  const direct = httpUrl(record.statusUrl) ?? httpUrl(record.statusURL) ?? httpUrl(record.status) ?? httpUrl(record.url)
  if (direct) return direct

  const hal = record._links as { self?: { href?: unknown } } | undefined
  const halSelf = httpUrl(hal?.self?.href)
  if (halSelf) return halSelf

  const links = record.links
  if (!links || typeof links !== "object") return undefined
  const bag = links as Record<string, { href?: unknown; type?: unknown } | undefined>
  for (const key of ["status", "result", "self"]) {
    const href = httpUrl(bag[key]?.href)
    if (href) return href
  }
  const entries = Object.values(bag).filter((entry) => entry && typeof entry === "object")
  const typedResult = entries.find((entry) => entry?.type === "result" && httpUrl(entry.href))
  if (typedResult) return httpUrl(typedResult.href)
  for (const entry of entries) {
    const href = httpUrl(entry?.href)
    if (href) return href
  }
  return undefined
}

/**
 * Poll a job status URL until it succeeds, fails, times out or the signal aborts. Resolves
 * with the final status body. A body without a status is treated as still running.
 * @category Http
 */
export async function pollAdobeJob(options: PollAdobeJobOptions): Promise<unknown> {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const now = options.now ?? Date.now
  const deadline = now() + timeoutMs
  let lastStatus: string | undefined

  for (;;) {
    if (options.signal?.aborted) throw abortReason(options.signal)
    const body = await options.client.request({ method: "GET", url: options.statusUrl, signal: options.signal })
    const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
    const raw = record.status
    const status = typeof raw === "string" ? raw.toLowerCase() : ""
    if (SUCCESS_STATUSES.has(status)) return body
    if (FAILURE_STATUSES.has(status)) {
      throw new AdobeServiceError(PROVIDER_ERROR, `Adobe job ended with status ${String(raw)}.`, {
        status: raw,
        statusUrl: redactUrl(options.statusUrl),
        ...pickErrorFields(record),
      })
    }
    lastStatus = typeof raw === "string" ? raw : lastStatus
    if (now() + intervalMs > deadline) {
      throw new AdobeServiceError(PROVIDER_ERROR, `Adobe job did not finish within ${timeoutMs} ms.`, {
        statusUrl: redactUrl(options.statusUrl),
        timeoutMs,
        ...(lastStatus === undefined ? {} : { lastStatus }),
      })
    }
    await sleep(intervalMs, options.signal)
  }
}

function pickErrorFields(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of ERROR_FIELDS) {
    if (record[key] !== undefined) out[key] = record[key]
  }
  const result = record.result
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const nested = (result as Record<string, unknown>).errors ?? (result as Record<string, unknown>).error
    if (nested !== undefined) out.resultErrors = nested
  }
  return out
}
