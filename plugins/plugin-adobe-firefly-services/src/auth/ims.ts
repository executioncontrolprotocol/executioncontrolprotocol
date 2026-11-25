import { createHash } from "node:crypto"
import { AdobeServiceError, errorMessage, PROVIDER_ERROR } from "../errors.js"
import { raceSignal } from "../runtime/abort.js"

/**
 * Production IMS OAuth server-to-server token endpoint.
 * @category Auth
 */
export const DEFAULT_IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3"

/**
 * Scopes requested when the config sets none.
 * @category Auth
 */
export const DEFAULT_FIREFLY_SCOPES =
  "openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis"

/**
 * A cached token is refreshed this long before it expires.
 * @category Auth
 */
export const TOKEN_REFRESH_SKEW_MS = 60_000

/**
 * Config fields used for IMS auth.
 * @category Auth
 */
export interface AdobeImsConfig {
  /** Adobe Developer Console client id. */
  clientId: string
  /** Adobe Developer Console client secret. */
  clientSecret: string
  /** Space- or comma-separated IMS scopes. */
  scopes?: string
  /** IMS token endpoint override. */
  imsEndpoint?: string
}

/**
 * Returns a bearer token, fetching or refreshing it when needed.
 * @category Auth
 */
export type AccessTokenProvider = (signal?: AbortSignal) => Promise<string>

/**
 * Options for {@link createImsTokenProvider}.
 * @category Auth
 */
export interface ImsTokenProviderOptions {
  /** Fetch implementation. Defaults to the global `fetch` at call time. */
  fetchImpl?: typeof fetch
  /** Refresh skew in milliseconds. Defaults to {@link TOKEN_REFRESH_SKEW_MS}. */
  skewMs?: number
  /** Clock. Defaults to `Date.now`. */
  now?: () => number
}

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

/**
 * Normalize scopes to the comma-separated form IMS expects.
 * @category Auth
 */
export function normalizeScopes(scopes: string | undefined): string {
  const raw = scopes?.trim() || DEFAULT_FIREFLY_SCOPES
  return raw.split(/[,\s]+/).filter(Boolean).join(",")
}

/**
 * Cache key for one credential set: a hash of client id, secret, scopes and endpoint, so the
 * secret is never used as a map key in clear.
 * @category Auth
 */
export function imsCacheKey(config: AdobeImsConfig): string {
  const parts = [
    config.clientId,
    config.clientSecret,
    normalizeScopes(config.scopes),
    config.imsEndpoint ?? DEFAULT_IMS_TOKEN_URL,
  ]
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex")
}

/**
 * Create a token provider with its own in-memory cache. Concurrent callers share one token
 * request; a caller's signal only stops that caller from waiting.
 * @category Auth
 */
export function createImsTokenProvider(
  config: AdobeImsConfig,
  options: ImsTokenProviderOptions = {},
): AccessTokenProvider {
  const skewMs = options.skewMs ?? TOKEN_REFRESH_SKEW_MS
  const now = options.now ?? Date.now
  let cached: CachedToken | undefined
  let pending: Promise<CachedToken> | undefined

  const fetchToken = async (): Promise<CachedToken> => {
    const fetchImpl = options.fetchImpl ?? fetch
    const endpoint = config.imsEndpoint ?? DEFAULT_IMS_TOKEN_URL
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: normalizeScopes(config.scopes),
    })
    const requestedAt = now()
    let res: Response
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      })
    } catch (error) {
      throw new AdobeServiceError(PROVIDER_ERROR, `Adobe IMS token request failed: ${errorMessage(error)}`, {
        endpoint,
      })
    }
    const text = await res.text()
    if (!res.ok) {
      const body = parseBody(text)
      throw new AdobeServiceError(PROVIDER_ERROR, imsHttpErrorMessage(res.status, body), {
        endpoint,
        status: res.status,
        body,
      })
    }
    const json = parseBody(text) as { access_token?: unknown; expires_in?: unknown }
    if (typeof json?.access_token !== "string" || typeof json.expires_in !== "number") {
      throw new AdobeServiceError(PROVIDER_ERROR, "Adobe IMS token response is missing access_token or expires_in.", {
        endpoint,
        status: res.status,
      })
    }
    return { accessToken: json.access_token, expiresAtMs: requestedAt + json.expires_in * 1000 }
  }

  return async (signal?: AbortSignal) => {
    if (cached && cached.expiresAtMs - skewMs > now()) return cached.accessToken
    if (!pending) {
      pending = fetchToken().then(
        (token) => {
          cached = token
          pending = undefined
          return token
        },
        (error: unknown) => {
          pending = undefined
          throw error
        },
      )
    }
    return (await raceSignal(pending, signal)).accessToken
  }
}

const providers = new Map<string, AccessTokenProvider>()

/**
 * Token provider for a credential set, shared across calls in this process so a warm host
 * reuses the token until it nears expiry.
 * @category Auth
 */
export function getImsTokenProvider(config: AdobeImsConfig, options: ImsTokenProviderOptions = {}): AccessTokenProvider {
  const key = imsCacheKey(config)
  let provider = providers.get(key)
  if (!provider) {
    provider = createImsTokenProvider(config, options)
    providers.set(key, provider)
  }
  return provider
}

/**
 * Drop every cached provider and token (tests, credential rotation).
 * @category Auth
 */
export function clearImsTokenCache(): void {
  providers.clear()
}

function parseBody(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text.slice(0, 2000)
  }
}

function imsHttpErrorMessage(status: number, body: unknown): string {
  const detail =
    isRecord(body) && typeof body.error_description === "string"
      ? body.error_description
      : isRecord(body) && typeof body.error === "string"
        ? body.error
        : isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
          ? body.error.message
          : undefined
  return detail
    ? `Adobe IMS token request returned HTTP ${status}: ${detail}`
    : `Adobe IMS token request returned HTTP ${status}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
