import { describe, expect, it, vi, beforeEach } from "vitest"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import {
  handleInvokePost,
  parseInvokeBody,
  runHttpInvoke,
} from "../../src/lib/http/handle-invoke.js"

function createRes(): {
  res: ServerResponse
  statusCode: number
  body: string
} {
  let statusCode = 200
  let body = ""
  const res = {
    headersSent: false,
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

function createReq(body = ""): IncomingMessage {
  const stream = Readable.from([body]) as IncomingMessage
  stream.method = "POST"
  stream.url = "/v1/invoke"
  stream.headers = { "content-type": "application/json" }
  return stream
}

describe("parseInvokeBody", () => {
  it("requires capability", () => {
    expect(parseInvokeBody("{}")).toEqual({ ok: false, error: "capability is required" })
  })

  it("rejects invalid JSON", () => {
    expect(parseInvokeBody("{")).toEqual({ ok: false, error: "Invalid JSON body" })
  })

  it("defaults input to {}", () => {
    expect(parseInvokeBody(JSON.stringify({ capability: "x.y" }))).toEqual({
      ok: true,
      body: { capability: "x.y", input: {} },
    })
  })

  it("passes provider when present", () => {
    expect(
      parseInvokeBody(
        JSON.stringify({
          capability: "h.evaluate",
          input: { a: 1 },
          provider: "p.generate",
        })
      )
    ).toEqual({
      ok: true,
      body: { capability: "h.evaluate", input: { a: 1 }, provider: "p.generate" },
    })
  })
})

describe("handleInvokePost / runHttpInvoke", () => {
  const ecp = {
    invoke: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes 400 when capability is missing", async () => {
    const out = createRes()
    await handleInvokePost(ecp as never, createReq("{}"), out.res)
    expect(out.statusCode).toBe(400)
    expect(JSON.parse(out.body)).toMatchObject({ error: "capability is required" })
  })

  it("invokes and returns 200 with the result", async () => {
    const process = vi.fn().mockResolvedValue({
      success: true,
      capabilityId: "@executioncontrolprotocol/test.echo",
      result: { echo: "hi" },
    })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const out = createRes()
    await handleInvokePost(
      ecp as never,
      createReq(
        JSON.stringify({
          capability: "@executioncontrolprotocol/test.echo",
          input: { value: "hi" },
        })
      ),
      out.res
    )
    expect(out.statusCode).toBe(200)
    expect(JSON.parse(out.body)).toMatchObject({ success: true, result: { echo: "hi" } })
    expect(ecp.invoke).toHaveBeenCalledWith("@executioncontrolprotocol/test.echo")
  })

  it("maps CAPABILITY_NOT_FOUND to HTTP 404 with InvokeResult body", async () => {
    const process = vi.fn().mockResolvedValue({
      schema: "@executioncontrolprotocol.invoke.result",
      success: false,
      capabilityId: "@executioncontrolprotocol/missing.cap",
      diagnostics: [{ code: "CAPABILITY_NOT_FOUND", message: "missing" }],
    })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const out = createRes()
    await handleInvokePost(
      ecp as never,
      createReq(JSON.stringify({ capability: "@executioncontrolprotocol/missing.cap" })),
      out.res
    )
    expect(out.statusCode).toBe(404)
    expect(JSON.parse(out.body)).toMatchObject({
      success: false,
      diagnostics: [{ code: "CAPABILITY_NOT_FOUND" }],
    })
  })

  it("maps INVOKE_INPUT_INVALID to HTTP 400", async () => {
    const process = vi.fn().mockResolvedValue({
      success: false,
      diagnostics: [{ code: "INVOKE_INPUT_INVALID", message: "bad" }],
    })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const out = createRes()
    await handleInvokePost(
      ecp as never,
      createReq(JSON.stringify({ capability: "x.y" })),
      out.res
    )
    expect(out.statusCode).toBe(400)
  })

  it("maps INVOKE_FAILED to HTTP 500 with InvokeResult body", async () => {
    const process = vi.fn().mockResolvedValue({
      schema: "@executioncontrolprotocol.invoke.result",
      success: false,
      capabilityId: "x.y",
      diagnostics: [{ code: "INVOKE_FAILED", message: "boom" }],
    })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const out = createRes()
    await handleInvokePost(
      ecp as never,
      createReq(JSON.stringify({ capability: "x.y" })),
      out.res
    )
    expect(out.statusCode).toBe(500)
    expect(JSON.parse(out.body)).toMatchObject({
      success: false,
      diagnostics: [{ code: "INVOKE_FAILED" }],
    })
  })

  it("maps INVOKE_DENIED to HTTP 403", async () => {
    const process = vi.fn().mockResolvedValue({
      success: false,
      diagnostics: [{ code: "INVOKE_DENIED", message: "no" }],
    })
    const withFn = vi.fn().mockReturnValue({ process, uses: vi.fn() })
    ecp.invoke.mockReturnValue({ with: withFn })

    const out = createRes()
    await handleInvokePost(
      ecp as never,
      createReq(JSON.stringify({ capability: "x.y" })),
      out.res
    )
    expect(out.statusCode).toBe(403)
  })

  it("applies provider via .uses", async () => {
    const process = vi.fn().mockResolvedValue({ success: true })
    const uses = vi.fn().mockReturnValue({ process })
    const withFn = vi.fn().mockReturnValue({ process, uses })
    ecp.invoke.mockReturnValue({ with: withFn })

    await runHttpInvoke(ecp as never, {
      capability: "h.evaluate",
      input: {},
      provider: "p.generate",
    })
    expect(uses).toHaveBeenCalledWith("p.generate")
  })
})
