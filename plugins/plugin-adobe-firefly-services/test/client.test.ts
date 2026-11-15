import { afterEach, describe, expect, it, vi } from "vitest"
import { buildUrl, createAdobeHttpClient, redactUrl, retryDelayMs } from "../src/http/client.js"
import { hangUntilAborted, jsonResponse } from "./helpers.js"

const URL_WITH_QUERY = "https://photoshop-api.adobe.io/v2/edit?sig=secret-token"

function client(fetchImpl: typeof fetch, extra: { maxRetries?: number } = {}) {
  return createAdobeHttpClient({
    clientId: "client-id",
    getAccessToken: async () => "tok",
    fetchImpl,
    retryBaseMs: 1,
    ...extra,
  })
}

function sequence(...responses: Array<Response | Error>) {
  const queue = [...responses]
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const next = queue.shift()
    if (!next) throw new Error("unexpected fetch")
    if (next instanceof Error) throw next
    return next
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createAdobeHttpClient", () => {
  it("sends bearer, x-api-key and JSON content type, and parses the JSON reply", async () => {
    const fetchImpl = sequence(jsonResponse(200, { ok: true }))
    const result = await client(fetchImpl).request({
      method: "POST",
      url: "https://firefly-api.adobe.io/v3/images/generate-async",
      body: { prompt: "dunes" },
      headers: { "x-model-version": "image4", authorization: "spoofed" },
    })

    expect(result).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init?.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer tok",
      "x-api-key": "client-id",
      "x-model-version": "image4",
      "content-type": "application/json",
    })
    expect(init?.body).toBe(JSON.stringify({ prompt: "dunes" }))
  })

  it("omits the body and content type for a GET and resolves undefined for an empty reply", async () => {
    const fetchImpl = sequence(new Response("", { status: 200 }))
    await expect(client(fetchImpl).request({ method: "GET", url: "https://x.test/a" })).resolves.toBeUndefined()
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init?.body).toBeUndefined()
    expect(init?.headers).not.toHaveProperty("content-type")
  })

  it("maps an HTTP error to ECP_PROVIDER_ERROR with status, body and a redacted URL", async () => {
    const fetchImpl = sequence(jsonResponse(400, { error_code: "invalid_request", message: "bad prompt" }))
    await expect(client(fetchImpl).request({ method: "POST", url: URL_WITH_QUERY, body: {} })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe API returned HTTP 400 for POST /v2/edit: bad prompt",
      details: {
        status: 400,
        method: "POST",
        url: "https://photoshop-api.adobe.io/v2/edit",
        body: { error_code: "invalid_request", message: "bad prompt" },
      },
    })
  })

  it("keeps a non-JSON error body as truncated text", async () => {
    const fetchImpl = sequence(new Response("x".repeat(5000), { status: 500 }))
    const error = await client(fetchImpl)
      .request({ method: "POST", url: "https://x.test/a" })
      .catch((e: unknown) => e as { details: { body: string } })
    expect(error.details.body).toHaveLength(2000)
  })

  it("rejects a non-JSON success body", async () => {
    const fetchImpl = sequence(new Response("<html>", { status: 200 }))
    await expect(client(fetchImpl).request({ method: "GET", url: "https://x.test/a" })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe API returned a non-JSON success body.",
    })
  })

  it("maps a network failure to ECP_PROVIDER_ERROR", async () => {
    const fetchImpl = sequence(new TypeError("fetch failed"))
    await expect(client(fetchImpl).request({ method: "GET", url: URL_WITH_QUERY })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe API request failed: fetch failed",
      details: { url: "https://photoshop-api.adobe.io/v2/edit" },
    })
  })

  it("passes an abort through unchanged", async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => hangUntilAborted(init ?? {}))
    const pending = client(fetchImpl).request({ method: "GET", url: "https://x.test/a", signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("retries a 429 (honouring Retry-After) for any method, then succeeds", async () => {
    const fetchImpl = sequence(jsonResponse(429, {}, { "retry-after": "0" }), jsonResponse(202, { jobId: "j" }))
    await expect(client(fetchImpl).request({ method: "POST", url: "https://x.test/a", body: {} })).resolves.toEqual({
      jobId: "j",
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("retries gateway errors for GET but never for POST", async () => {
    const getFetch = sequence(new Response("", { status: 503 }), new Response("", { status: 502 }), jsonResponse(200, { s: 1 }))
    await expect(client(getFetch).request({ method: "GET", url: "https://x.test/a" })).resolves.toEqual({ s: 1 })
    expect(getFetch).toHaveBeenCalledTimes(3)

    const postFetch = sequence(new Response("", { status: 503 }))
    await expect(client(postFetch).request({ method: "POST", url: "https://x.test/a" })).rejects.toMatchObject({
      details: { status: 503 },
    })
    expect(postFetch).toHaveBeenCalledTimes(1)
  })

  it("gives up after the retry budget", async () => {
    const fetchImpl = sequence(jsonResponse(429, {}), jsonResponse(429, { limit: true }))
    await expect(client(fetchImpl, { maxRetries: 1 }).request({ method: "GET", url: "https://x.test/a" })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 429, body: { limit: true } },
    })
  })

  it("stops a retry wait when the signal aborts", async () => {
    const controller = new AbortController()
    const fetchImpl = sequence(jsonResponse(429, {}, { "retry-after": "5" }))
    const pending = client(fetchImpl).request({ method: "GET", url: "https://x.test/a", signal: controller.signal })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("uses the global fetch when none is injected", async () => {
    const mock = vi.fn(async () => jsonResponse(200, { g: 1 }))
    vi.stubGlobal("fetch", mock)
    const c = createAdobeHttpClient({ clientId: "c", getAccessToken: async () => "t" })
    await expect(c.request({ method: "GET", url: "https://x.test/a" })).resolves.toEqual({ g: 1 })
  })
})

describe("retryDelayMs", () => {
  it("uses Retry-After seconds, else exponential backoff, capped at ten seconds", () => {
    expect(retryDelayMs("2", 0, 1000)).toBe(2000)
    expect(retryDelayMs(null, 0, 1000)).toBe(1000)
    expect(retryDelayMs(null, 2, 1000)).toBe(4000)
    expect(retryDelayMs("not-a-number", 1, 1000)).toBe(2000)
    expect(retryDelayMs("600", 0, 1000)).toBe(10_000)
  })
})

describe("buildUrl and redactUrl", () => {
  it("fills path templates, encodes values and appends query parameters", () => {
    expect(buildUrl("https://api.test", "/v1/jobs/{jobId}/files/{name}", { jobId: "a b", name: 7 }, { limit: 10, all: true })).toBe(
      "https://api.test/v1/jobs/a%20b/files/7?limit=10&all=true",
    )
  })

  it("keeps a server base path and replaces repeated placeholders", () => {
    expect(buildUrl("https://api.test/base/", "/x/{id}/{id}", { id: "1" })).toBe("https://api.test/base/x/1/1")
  })

  it("strips the query string from a URL", () => {
    expect(redactUrl(URL_WITH_QUERY)).toBe("https://photoshop-api.adobe.io/v2/edit")
    expect(redactUrl("not a url?x=1")).toBe("not a url")
  })
})
