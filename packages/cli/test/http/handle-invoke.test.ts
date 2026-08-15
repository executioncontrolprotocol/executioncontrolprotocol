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
