import { AdobeServiceError, errorMessage, isAbortError, PROVIDER_ERROR } from "../errors.js"
import type { AccessTokenProvider } from "../auth/ims.js"
import { sleep } from "../runtime/abort.js"
import type { RequestLimiter } from "./request-limit.js"

/**
 * HTTP methods used by the generated operations.
 * @category Http
 */
export type AdobeHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

/**
 * One Adobe API call.
 * @category Http
 */
export interface AdobeRequestOptions {
  /** HTTP method. */
  method: AdobeHttpMethod
  /** Absolute URL. */
  url: string
  /** JSON body, serialized when present. */
  body?: unknown
  /** Extra headers (never auth; the client sets those). */
  headers?: Record<string, string>
  /** Aborts the request and any retry wait. */
  signal?: AbortSignal
}

/**
 * Authenticated JSON client for Firefly Services APIs.
 * @category Http
 */
export interface AdobeHttpClient {
  /** Perform one request. Resolves with the parsed JSON body, or undefined for an empty body. */
  request(options: AdobeRequestOptions): Promise<unknown>
}

/**
 * Options for {@link createAdobeHttpClient}.
 * @category Http
 */
export interface AdobeHttpClientOptions {
  /** Client id, sent as `x-api-key`. */
  clientId: string
  /** Bearer token source. */
  getAccessToken: AccessTokenProvider
  /** Fetch implementation. Defaults to the global `fetch` at call time. */
  fetchImpl?: typeof fetch
  /** Retries for rate limits and gateway errors. Defaults to {@link DEFAULT_MAX_RETRIES}. */
  maxRetries?: number
  /** Base backoff in milliseconds when no Retry-After header is sent. Defaults to 1000. */
  retryBaseMs?: number
  /**
   * Request budget for the credential set. Every non-GET attempt (job submissions and other calls,
   * including a retry after 429) waits for a slot; GET requests such as job status polls do not.
   */
  limiter?: RequestLimiter
}

/**
 * Default retry budget for 429 (any method) and 502/503/504 (GET only).
 * @category Http
 */
export const DEFAULT_MAX_RETRIES = 2

const MAX_RETRY_WAIT_MS = 10_000
const GATEWAY_STATUSES = new Set([502, 503, 504])
const MAX_ERROR_BODY_CHARS = 2000

/**
 * Create the Adobe HTTP client (Bearer token plus `x-api-key`). A 429 is retried for any
 * method because Adobe has not accepted the request; gateway errors are retried for GET only
 * so a job is never submitted twice.
 * @category Http
 */
export function createAdobeHttpClient(options: AdobeHttpClientOptions): AdobeHttpClient {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryBaseMs = options.retryBaseMs ?? 1000

  return {
    async request(req) {
      const fetchImpl = options.fetchImpl ?? fetch
      for (let attempt = 0; ; attempt++) {
        const token = await options.getAccessToken(req.signal)
        const headers: Record<string, string> = {
          accept: "application/json",
          ...(req.headers ?? {}),
          authorization: `Bearer ${token}`,
          "x-api-key": options.clientId,
        }
        let body: string | undefined
        if (req.body !== undefined) {
          headers["content-type"] = "application/json"
          body = JSON.stringify(req.body)
        }

        if (options.limiter && req.method !== "GET") await options.limiter.acquire(req.signal)
        let res: Response
        try {
          res = await fetchImpl(req.url, { method: req.method, headers, body, signal: req.signal })
        } catch (error) {
          if (isAbortError(error)) throw error
          throw new AdobeServiceError(PROVIDER_ERROR, `Adobe API request failed: ${errorMessage(error)}`, {
            method: req.method,
            url: redactUrl(req.url),
          })
        }

        const text = await res.text()
        if (res.ok) {
          if (!text) return undefined
          try {
            return JSON.parse(text) as unknown
          } catch {
            throw new AdobeServiceError(PROVIDER_ERROR, "Adobe API returned a non-JSON success body.", {
              method: req.method,
              url: redactUrl(req.url),
              status: res.status,
            })
          }
        }

        const retryable = res.status === 429 || (req.method === "GET" && GATEWAY_STATUSES.has(res.status))
        if (retryable && attempt < maxRetries) {
          await sleep(retryDelayMs(res.headers.get("retry-after"), attempt, retryBaseMs), req.signal)
          continue
        }
        const errorBody = parseErrorBody(text)
        throw new AdobeServiceError(
          PROVIDER_ERROR,
          adobeHttpErrorMessage(res.status, req.method, pathOf(req.url), errorBody),
          {
            method: req.method,
            url: redactUrl(req.url),
            status: res.status,
            body: errorBody,
          },
        )
      }
    },
  }
}

/**
 * Delay before a retry: the Retry-After header (seconds) when present, else exponential
 * backoff. Capped at ten seconds.
 * @category Http
 */
export function retryDelayMs(retryAfter: string | null, attempt: number, baseMs: number): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter)
  const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : baseMs * 2 ** attempt
  return Math.min(wait, MAX_RETRY_WAIT_MS)
}

/**
 * Substitute `{param}` placeholders in an OpenAPI path template and append query values.
 * @category Http
 */
export function buildUrl(
  serverUrl: string,
  pathTemplate: string,
  pathParams: Record<string, string | number | boolean>,
  queryParams: Record<string, string | number | boolean> = {},
): string {
  let path = pathTemplate
  for (const [key, value] of Object.entries(pathParams)) {
    path = path.split(`{${key}}`).join(encodeURIComponent(String(value)))
  }
  const base = serverUrl.endsWith("/") ? serverUrl : `${serverUrl}/`
  const url = new URL(path.replace(/^\//, ""), base)
  for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, String(value))
  return url.toString()
}

/**
 * URL without its query string, so presigned tokens never reach step records or logs.
 * @category Http
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split("?")[0] ?? url
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function parseErrorBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text.slice(0, MAX_ERROR_BODY_CHARS)
  }
}

function adobeHttpErrorMessage(status: number, method: string, path: string, body: unknown): string {
  const detail = providerDetail(body)
  const base = `Adobe API returned HTTP ${status} for ${method} ${path}`
  return detail ? `${base}: ${detail}` : `${base}.`
}

function providerDetail(body: unknown): string | undefined {
  if (!isRecord(body)) return typeof body === "string" && body.length > 0 ? body.slice(0, 500) : undefined
  if (typeof body.error_description === "string") return body.error_description
  if (typeof body.message === "string") return body.message
  if (typeof body.error === "string") return body.error
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
