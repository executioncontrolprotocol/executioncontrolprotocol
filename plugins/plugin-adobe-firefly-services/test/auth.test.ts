import { describe, expect, it, vi, afterEach } from "vitest"
import { createImsTokenProvider, DEFAULT_IMS_TOKEN_URL, normalizeScopes } from "../src/auth/ims.js"

describe("IMS auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("normalizeScopes defaults and joins tokens", () => {
    expect(normalizeScopes(undefined)).toContain("firefly_api")
    expect(normalizeScopes("a b,c")).toBe("a,b,c")
  })

  it("caches tokens until near expiry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok-2", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    const getToken = createImsTokenProvider(
      { clientId: "id", clientSecret: "secret" },
      fetchImpl as unknown as typeof fetch,
      60_000,
    )

    await expect(getToken()).resolves.toBe("tok-1")
    await expect(getToken()).resolves.toBe("tok-1")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(DEFAULT_IMS_TOKEN_URL)
  })

  it("throws on IMS error responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("nope", { status: 401 }),
    )
    const getToken = createImsTokenProvider(
      { clientId: "id", clientSecret: "secret" },
      fetchImpl as unknown as typeof fetch,
    )
    await expect(getToken()).rejects.toThrow(/IMS token request failed/)
  })
})
