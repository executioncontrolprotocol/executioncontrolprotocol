import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearImsTokenCache,
  createImsTokenProvider,
  DEFAULT_FIREFLY_SCOPES,
  DEFAULT_IMS_TOKEN_URL,
  getImsTokenProvider,
  imsCacheKey,
  normalizeScopes,
  TOKEN_REFRESH_SKEW_MS,
} from "../src/auth/ims.js"
import { jsonResponse, tokenResponse } from "./helpers.js"

const config = { clientId: "id", clientSecret: "secret" }

function fetchSequence(...responses: Array<Response | Error>) {
  const queue = [...responses]
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue.shift()
    if (!next) throw new Error("unexpected fetch")
    if (next instanceof Error) throw next
    return next
  })
}

beforeEach(() => {
  clearImsTokenCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createImsTokenProvider", () => {
  it("posts client credentials and caches the token (cache hit)", async () => {
    const fetchImpl = fetchSequence(tokenResponse("t1", 3600))
    const getToken = createImsTokenProvider({ ...config, scopes: "a b,c" }, { fetchImpl })

    await expect(getToken()).resolves.toBe("t1")
    await expect(getToken()).resolves.toBe("t1")

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(DEFAULT_IMS_TOKEN_URL)
    expect(init?.method).toBe("POST")
    const form = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "id",
      client_secret: "secret",
      scope: "a,b,c",
    })
  })

  it("refreshes before expiry once inside the skew window", async () => {
    let now = 1_000_000
    const fetchImpl = fetchSequence(tokenResponse("old", 3600), tokenResponse("new", 3600))
    const getToken = createImsTokenProvider(config, { fetchImpl, now: () => now })

    await expect(getToken()).resolves.toBe("old")
    now += 3600_000 - TOKEN_REFRESH_SKEW_MS - 1
    await expect(getToken()).resolves.toBe("old")
    now += 2
    await expect(getToken()).resolves.toBe("new")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("honours a custom skew and endpoint", async () => {
    let now = 0
    const fetchImpl = fetchSequence(tokenResponse("a", 10), tokenResponse("b", 10))
    const getToken = createImsTokenProvider(
      { ...config, imsEndpoint: "https://ims.example.test/token" },
      { fetchImpl, now: () => now, skewMs: 0 },
    )
    await getToken()
    now = 9_999
    await expect(getToken()).resolves.toBe("a")
    now = 10_000
    await expect(getToken()).resolves.toBe("b")
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://ims.example.test/token")
  })

  it("shares one in-flight request between concurrent callers", async () => {
    let release: (res: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const getToken = createImsTokenProvider(config, { fetchImpl })

    const first = getToken()
    const second = getToken()
    release(tokenResponse("shared"))

    await expect(Promise.all([first, second])).resolves.toEqual(["shared", "shared"])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("maps an HTTP error to ECP_PROVIDER_ERROR with status and body", async () => {
    const fetchImpl = fetchSequence(jsonResponse(401, { error: "invalid_client" }))
    const getToken = createImsTokenProvider(config, { fetchImpl })

    await expect(getToken()).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe IMS token request returned HTTP 401: invalid_client",
      details: { status: 401, body: { error: "invalid_client" }, endpoint: DEFAULT_IMS_TOKEN_URL },
    })
  })

  it("keeps a non-JSON error body as text", async () => {
    const fetchImpl = fetchSequence(new Response("gateway down", { status: 502 }))
    await expect(createImsTokenProvider(config, { fetchImpl })()).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 502, body: "gateway down" },
    })
  })

  it("maps a network failure to ECP_PROVIDER_ERROR", async () => {
    const fetchImpl = fetchSequence(new TypeError("fetch failed"))
    await expect(createImsTokenProvider(config, { fetchImpl })()).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe IMS token request failed: fetch failed",
    })
  })

  it("rejects a token response without access_token or expires_in", async () => {
    const fetchImpl = fetchSequence(jsonResponse(200, { access_token: "x" }), new Response("", { status: 200 }))
    const getToken = createImsTokenProvider(config, { fetchImpl })
    await expect(getToken()).rejects.toMatchObject({ code: "ECP_PROVIDER_ERROR", message: expect.stringContaining("missing") })
    await expect(getToken()).rejects.toMatchObject({ code: "ECP_PROVIDER_ERROR" })
  })

  it("retries on the next call after a failure", async () => {
    const fetchImpl = fetchSequence(new TypeError("offline"), tokenResponse("later"))
    const getToken = createImsTokenProvider(config, { fetchImpl })
    await expect(getToken()).rejects.toMatchObject({ code: "ECP_PROVIDER_ERROR" })
    await expect(getToken()).resolves.toBe("later")
  })

  it("stops waiting when the caller's signal aborts, without cancelling the shared request", async () => {
    let release: (res: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const getToken = createImsTokenProvider(config, { fetchImpl })
    const controller = new AbortController()

    const aborted = getToken(controller.signal)
    const other = getToken()
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" })

    release(tokenResponse("still-good"))
    await expect(other).resolves.toBe("still-good")
  })

  it("rejects immediately for an already-aborted signal", async () => {
    const fetchImpl = fetchSequence(tokenResponse("t"))
    const controller = new AbortController()
    controller.abort()
    await expect(createImsTokenProvider(config, { fetchImpl })(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  it("uses the global fetch when none is injected", async () => {
    const mock = vi.fn(async () => tokenResponse("global"))
    vi.stubGlobal("fetch", mock)
    await expect(createImsTokenProvider(config)()).resolves.toBe("global")
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe("getImsTokenProvider", () => {
  it("reuses one provider (and token) per credential set", async () => {
    const fetchImpl = fetchSequence(tokenResponse("one"))
    const a = getImsTokenProvider(config, { fetchImpl })
    const b = getImsTokenProvider({ ...config }, { fetchImpl })
    expect(a).toBe(b)
    await a()
    await b()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("keeps separate caches when the secret, scopes or endpoint differ", () => {
    const base = getImsTokenProvider(config)
    expect(getImsTokenProvider({ ...config, clientSecret: "other" })).not.toBe(base)
    expect(getImsTokenProvider({ ...config, scopes: "openid" })).not.toBe(base)
    expect(getImsTokenProvider({ ...config, imsEndpoint: "https://ims.example.test" })).not.toBe(base)
  })

  it("starts fresh after clearImsTokenCache", () => {
    const before = getImsTokenProvider(config)
    clearImsTokenCache()
    expect(getImsTokenProvider(config)).not.toBe(before)
  })
})

describe("imsCacheKey and normalizeScopes", () => {
  it("hashes the credential set without exposing the secret", () => {
    const key = imsCacheKey(config)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain("secret")
    expect(imsCacheKey({ ...config, scopes: DEFAULT_FIREFLY_SCOPES })).toBe(key)
  })

  it("normalizes separators and falls back to the default scopes", () => {
    expect(normalizeScopes(" a,  b c ")).toBe("a,b,c")
    expect(normalizeScopes(undefined)).toBe(DEFAULT_FIREFLY_SCOPES)
    expect(normalizeScopes("  ")).toBe(DEFAULT_FIREFLY_SCOPES)
  })
})
