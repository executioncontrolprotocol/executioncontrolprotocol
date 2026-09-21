/**
 * @category Http
 * Typed Adobe Firefly Services HTTP error.
 */
export class AdobeHttpError extends Error {
  /** HTTP status code. */
  readonly status: number
  /** Response body text. */
  readonly bodyText: string
  /** Request URL. */
  readonly url: string

  constructor(status: number, bodyText: string, url: string) {
    super(`Adobe API ${status} for ${url}: ${bodyText.slice(0, 500)}`)
    this.name = "AdobeHttpError"
    this.status = status
    this.bodyText = bodyText
    this.url = url
  }
}

/**
 * Options for a single Adobe API call.
 * @category Http
 */
export interface AdobeRequestOptions {
  /** HTTP method. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
  /** Absolute URL. */
  url: string
  /** JSON body (serialized when present). */
  body?: unknown
  /** Extra headers. */
  headers?: Record<string, string>
}

/**
 * Minimal Adobe HTTP client (Bearer + x-api-key).
 * @category Http
 */
export interface AdobeHttpClient {
  /** Perform an authenticated JSON request. */
  request: (options: AdobeRequestOptions) => Promise<unknown>
}

/**
 * Create an Adobe HTTP client.
 * @category Http
 */
export function createAdobeHttpClient(options: {
  /** Adobe client id (x-api-key). */
  clientId: string
  /** Resolves a bearer access token. */
  getAccessToken: () => Promise<string>
  /** Fetch implementation. */
  fetchImpl?: typeof fetch
}): AdobeHttpClient {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async request(req) {
      const token = await options.getAccessToken()
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "x-api-key": options.clientId,
        Accept: "application/json",
        ...(req.headers ?? {}),
      }
      let body: string | undefined
      if (req.body !== undefined) {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
        body = JSON.stringify(req.body)
      }

      const res = await fetchImpl(req.url, { method: req.method, headers, body })
      const text = await res.text()
      if (!res.ok) {
        throw new AdobeHttpError(res.status, text, req.url)
      }
      if (!text) return undefined
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new Error(`Adobe API returned non-JSON body for ${req.url}`)
      }
    },
  }
}

/**
 * Substitute `{param}` placeholders in an OpenAPI path template.
 * @category Http
 */
export function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  pathParams: Record<string, string | number | boolean>,
  queryParams?: Record<string, string | number | boolean | undefined>,
): string {
  let path = pathTemplate
  for (const [key, value] of Object.entries(pathParams)) {
    path = path.replace(new RegExp(`\\{${key}\\}`, "g"), encodeURIComponent(String(value)))
  }
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}
