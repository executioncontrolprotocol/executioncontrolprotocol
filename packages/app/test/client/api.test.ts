import { describe, expect, it, vi } from "vitest"
import {
  AppHostClient,
  HostRequestError,
  isOperationResponse,
  toOperationResponse,
  UnauthorizedError,
  type FetchLike,
} from "../../src/client/api.js"

const BASE = "http://127.0.0.1:4000"
const TOKEN = "tok-1"

interface Call {
  url: string
  init: RequestInit | undefined
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>): {
  fetch: FetchLike
  calls: Call[]
} {
  const calls: Call[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return respond(url, init)
  }
  return { fetch, calls }
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name]
}

describe("isOperationResponse", () => {
  it("accepts ok and refused envelopes", () => {
    expect(isOperationResponse({ ok: true, data: {} })).toBe(true)
    expect(isOperationResponse({ ok: false, error: { code: "ECP_NOT_FOUND", message: "x" } })).toBe(true)
  })

  it("rejects other shapes", () => {
    expect(isOperationResponse(null)).toBe(false)
    expect(isOperationResponse("ok")).toBe(false)
    expect(isOperationResponse({ ok: true })).toBe(false)
    expect(isOperationResponse({ ok: false })).toBe(false)
    expect(isOperationResponse({ ok: false, error: { message: "no code" } })).toBe(false)
    expect(isOperationResponse({ ok: "yes", data: 1 })).toBe(false)
  })
})

describe("toOperationResponse", () => {
  it("passes envelopes through on any status", () => {
    const refused = { ok: false, error: { code: "ECP_MANIFEST_INVALID", message: "bad", issues: [] } }
    expect(toOperationResponse(422, refused)).toEqual(refused)
    expect(toOperationResponse(200, { ok: true, data: { a: 1 } })).toEqual({ ok: true, data: { a: 1 } })
  })

  it("throws UnauthorizedError on 401, keeping the host message", () => {
    expect(() => toOperationResponse(401, { ok: false, error: { code: "ECP_UNAUTHORIZED", message: "nope" } })).toThrow(
      "nope",
    )
    try {
      toOperationResponse(401, undefined)
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError)
      expect((error as UnauthorizedError).code).toBe("ECP_UNAUTHORIZED")
      expect((error as Error).message).toBe("The host rejected the token.")
    }
  })

  it("turns a non-envelope body into ECP_INTERNAL", () => {
    const result = toOperationResponse(502, "<html>")
    expect(result).toEqual({
      ok: false,
      error: { code: "ECP_INTERNAL", message: "The host answered HTTP 502 without an operation envelope." },
    })
  })
})

describe("AppHostClient operations", () => {
  it("POSTs retrieve, execute and commit as JSON with the bearer token", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(200, { ok: true, data: { type: "run", items: [], total: 0 } }))
    const client = new AppHostClient(BASE, TOKEN, { fetch })
    await client.retrieve({ type: "run" })
    await client.execute({ mode: "validate", execution: { path: "/a.ecp.json" } })
    await client.commit({ type: "execution", action: "delete", id: "x", ifVersion: 1 })
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/v1/retrieve`,
      `${BASE}/v1/execute`,
      `${BASE}/v1/commit`,
    ])
    for (const call of calls) {
      expect(call.init?.method).toBe("POST")
      expect(headerOf(call.init, "Authorization")).toBe(`Bearer ${TOKEN}`)
      expect(headerOf(call.init, "Content-Type")).toContain("application/json")
    }
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ mode: "validate", execution: { path: "/a.ecp.json" } })
  })

  it("returns refusals from non-2xx responses as envelopes", async () => {
    const refused = { ok: false, error: { code: "ECP_MANIFEST_INVALID", message: "bad", issues: [{ code: "ECP_EXPR_INVALID" }] } }
    const { fetch } = mockFetch(() => jsonResponse(422, refused))
    const client = new AppHostClient(BASE, TOKEN, { fetch })
    await expect(client.execute({ mode: "validate", execution: { id: "x" } })).resolves.toEqual(refused)
  })

  it("returns ECP_INTERNAL for a body that is not JSON", async () => {
    const { fetch } = mockFetch(() => new Response("oops", { status: 500 }))
    const response = await new AppHostClient(BASE, TOKEN, { fetch }).retrieve({ type: "plugin" })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.error.code).toBe("ECP_INTERNAL")
  })

  it("throws UnauthorizedError on 401 and calls onUnauthorized", async () => {
    const onUnauthorized = vi.fn()
    const { fetch } = mockFetch(() => jsonResponse(401, { ok: false, error: { code: "ECP_UNAUTHORIZED", message: "rejected" } }))
    const client = new AppHostClient(BASE, TOKEN, { fetch, onUnauthorized })
    await expect(client.retrieve({ type: "run" })).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(client.getFile("/a.ecp.json")).rejects.toThrow("rejected")
    expect(onUnauthorized).toHaveBeenCalledTimes(2)
  })

  it("throws ECP_HOST_UNAVAILABLE when the host cannot be reached", async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError("fetch failed")
    }
    const client = new AppHostClient(BASE, TOKEN, { fetch })
    const error = await client.retrieve({ type: "run" }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HostRequestError)
    expect((error as HostRequestError).code).toBe("ECP_HOST_UNAVAILABLE")
    expect((error as HostRequestError).status).toBe(0)
    expect((error as HostRequestError).message).toContain("fetch failed")
  })

  it("reports non-Error throws from fetch too", async () => {
    const fetch: FetchLike = async () => {
      throw "down"
    }
    const error = await new AppHostClient(BASE, TOKEN, { fetch }).listFiles("/d").catch((caught: unknown) => caught)
    expect((error as HostRequestError).message).toContain("down")
  })

  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { ok: true, data: {} }))
    try {
      await new AppHostClient(BASE, TOKEN).retrieve({ type: "plugin" })
      expect(spy).toHaveBeenCalledWith(`${BASE}/v1/retrieve`, expect.objectContaining({ method: "POST" }))
    } finally {
      spy.mockRestore()
    }
  })
})

describe("AppHostClient file routes", () => {
  it("getFile returns the file text and encodes the path", async () => {
    const { fetch, calls } = mockFetch(() => new Response('{"schema":"x"}', { status: 200 }))
    const text = await new AppHostClient(BASE, TOKEN, { fetch }).getFile("C:\\work\\a b.ecp.json")
    expect(text).toBe('{"schema":"x"}')
    expect(calls[0]?.url).toBe(`${BASE}/v1/file?path=C%3A%5Cwork%5Ca+b.ecp.json`)
    expect(calls[0]?.init?.method).toBe("GET")
    expect(headerOf(calls[0]?.init, "Authorization")).toBe(`Bearer ${TOKEN}`)
  })

  it("getFile throws the host refusal", async () => {
    const { fetch } = mockFetch(() => jsonResponse(404, { ok: false, error: { code: "ECP_NOT_FOUND", message: "missing" } }))
    const error = await new AppHostClient(BASE, TOKEN, { fetch }).getFile("/x.ecp.json").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HostRequestError)
    expect((error as HostRequestError).code).toBe("ECP_NOT_FOUND")
    expect((error as HostRequestError).status).toBe(404)
  })

  it("getFile reports ECP_INTERNAL for an odd error body", async () => {
    const { fetch } = mockFetch(() => new Response("broken", { status: 500 }))
    const error = await new AppHostClient(BASE, TOKEN, { fetch }).getFile("/x.ecp.json").catch((caught: unknown) => caught)
    expect((error as HostRequestError).code).toBe("ECP_INTERNAL")
  })

  it("getFile reports an ok envelope on an error status as unexpected", async () => {
    const { fetch } = mockFetch(() => jsonResponse(500, { ok: true, data: {} }))
    const error = await new AppHostClient(BASE, TOKEN, { fetch }).getFile("/x.ecp.json").catch((caught: unknown) => caught)
    expect((error as HostRequestError).code).toBe("ECP_INTERNAL")
    expect((error as HostRequestError).message).toBe("Unexpected HTTP 500.")
  })

  it("listFiles returns string paths only", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(200, { ok: true, data: { files: ["/d/a.ecp.json", 3, "/d/b.ecp.json"] } }))
    const files = await new AppHostClient(BASE, TOKEN, { fetch }).listFiles("/d")
    expect(files).toEqual(["/d/a.ecp.json", "/d/b.ecp.json"])
    expect(calls[0]?.url).toBe(`${BASE}/v1/files?dir=%2Fd`)
  })

  it("listFiles returns an empty list when files is missing", async () => {
    const { fetch } = mockFetch(() => jsonResponse(200, { ok: true, data: {} }))
    await expect(new AppHostClient(BASE, TOKEN, { fetch }).listFiles("/d")).resolves.toEqual([])
  })

  it("listFiles throws refusals", async () => {
    const { fetch } = mockFetch(() => jsonResponse(400, { ok: false, error: { code: "ECP_REQUEST_INVALID", message: "dir" } }))
    await expect(new AppHostClient(BASE, TOKEN, { fetch }).listFiles("")).rejects.toMatchObject({
      code: "ECP_REQUEST_INVALID",
      status: 400,
    })
  })
})

describe("AppHostClient.watchUrl", () => {
  const client = new AppHostClient(BASE, TOKEN)

  it("builds the watch URL with types, runId and path", () => {
    expect(client.watchUrl({ types: ["run", "execution"], runId: "run-1", path: "/a b.ecp.json" })).toBe(
      `${BASE}/v1/watch?types=run%2Cexecution&runId=run-1&path=%2Fa+b.ecp.json`,
    )
  })

  it("omits the query when nothing is set", () => {
    expect(client.watchUrl()).toBe(`${BASE}/v1/watch`)
    expect(client.watchUrl({ types: [] })).toBe(`${BASE}/v1/watch`)
  })
})
