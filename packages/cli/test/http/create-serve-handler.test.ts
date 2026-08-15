import { describe, expect, it, vi, beforeEach } from "vitest"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { createServeRequestHandler } from "../../src/lib/http/create-serve-handler.js"

function createRes(): {
  res: ServerResponse
  statusCode: number
  body: string
} {
  let statusCode = 200
  let body = ""
  const res = {
    headersSent: false,
    setHeader() {
      return this
    },
    writeHead(code: number) {
      statusCode = code
      return this
    },
    end(chunk?: string) {
      if (chunk) body = chunk
      return this
    },
  } as unknown as ServerResponse
  return {
    res,
    get statusCode() {
      return statusCode
    },
    get body() {
      return body
    },
  }
}

function createReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = ""
): IncomingMessage {
  const stream = Readable.from([body]) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = headers
  return stream
}

describe("createServeRequestHandler", () => {
  const ecp = {
    invoke: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns health without ollama fields", async () => {
    const handler = createServeRequestHandler({
      ecp: ecp as never,
      allowOrigins: new Set(),
    })
    const out = createRes()
    await handler(createReq("GET", "/health"), out.res)
    expect(out.statusCode).toBe(200)
    const body = JSON.parse(out.body) as { ok: boolean; version: string; ollamaReachable?: boolean }
    expect(body.ok).toBe(true)
    expect(typeof body.version).toBe("string")
    expect(body.ollamaReachable).toBeUndefined()
  })

  it("invokes without requiring a token", async () => {
    const process = vi.fn().mockResolvedValue({ success: true, result: { echo: "x" } })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const handler = createServeRequestHandler({
      ecp: ecp as never,
      allowOrigins: new Set(),
    })
    const out = createRes()
    await handler(
      createReq(
        "POST",
        "/v1/invoke",
        { "content-type": "application/json" },
        JSON.stringify({
          capability: "@executioncontrolprotocol/test.echo",
          input: { value: "x" },
        })
      ),
      out.res
    )
    expect(out.statusCode).toBe(200)
    expect(JSON.parse(out.body)).toMatchObject({ success: true })
    expect(ecp.invoke).toHaveBeenCalled()
  })

  it("returns 404 for unknown paths", async () => {
    const handler = createServeRequestHandler({
      ecp: ecp as never,
      allowOrigins: new Set(),
    })
    const out = createRes()
    await handler(createReq("GET", "/nope"), out.res)
    expect(out.statusCode).toBe(404)
  })
})
