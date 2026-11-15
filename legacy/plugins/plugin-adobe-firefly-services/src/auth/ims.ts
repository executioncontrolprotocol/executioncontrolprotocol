/**
 * @category Auth
 * Adobe IMS OAuth Server-to-Server (client_credentials) token helper.
 */
export const DEFAULT_IMS_TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3"

/** Default scopes for Firefly Services S2S credentials. */
export const DEFAULT_FIREFLY_SCOPES =
  "openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis"

/**
 * Extension config fields used for IMS auth.
 * @category Auth
 */
export interface AdobeImsConfig {
  /** Adobe Developer Console client id (also used as x-api-key). */
  clientId: string
  /** Adobe Developer Console client secret. */
  clientSecret: string
  /** Space- or comma-separated IMS scopes. */
  scopes?: string
  /** Override IMS token endpoint. */
  imsEndpoint?: string
}

/**
 * Cached bearer token.
 * @category Auth
 */
export interface AdobeAccessToken {
  /** Bearer access token. */
  accessToken: string
  /** Absolute expiry time (epoch ms). */
  expiresAtMs: number
}

/**
 * Normalize scopes to the form IMS expects (comma-separated).
 * @category Auth
 */
export function normalizeScopes(scopes: string | undefined): string {
  const raw = (scopes ?? DEFAULT_FIREFLY_SCOPES).trim()
  return raw.split(/[,\s]+/).filter(Boolean).join(",")
}

/**
 * Create an IMS token provider with in-memory cache and refresh skew.
 * @category Auth
 */
export function createImsTokenProvider(
  config: AdobeImsConfig,
  fetchImpl: typeof fetch = fetch,
  skewMs = 60_000,
): () => Promise<string> {
  let cached: AdobeAccessToken | undefined

  return async () => {
    const now = Date.now()
    if (cached && cached.expiresAtMs - skewMs > now) {
      return cached.accessToken
    }

    const endpoint = config.imsEndpoint ?? DEFAULT_IMS_TOKEN_URL
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: normalizeScopes(config.scopes),
    })

    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Adobe IMS token request failed (${res.status}): ${text}`)
    }

    const json = (await res.json()) as {
      access_token?: string
      expires_in?: number
    }
    if (!json.access_token || typeof json.expires_in !== "number") {
      throw new Error("Adobe IMS token response missing access_token or expires_in")
    }

    cached = {
      accessToken: json.access_token,
      expiresAtMs: now + json.expires_in * 1000,
    }
    return cached.accessToken
  }
}
