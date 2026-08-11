import { describe, expect, it } from "vitest"
import type { IncomingMessage, ServerResponse } from "node:http"
import { setCorsAndPna, readBearerToken } from "../../src/lib/up/cors.js"

function mockReq(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as IncomingMessage
}

function mockRes(): ServerResponse & { headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  return {
    headers,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value)
      return this as ServerResponse
    },
  } as ServerResponse & { headers: Record<string, string> }
}

describe("setCorsAndPna", () => {
  it("reflects an allowlisted Origin", () => {
    const req = mockReq({ origin: "http://localhost:5173" })
    const res = mockRes()
    setCorsAndPna(req, res, new Set(["http://localhost:5173"]))
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173")
    expect(res.headers["vary"]).toBe("Origin")
  })

  it("does not reflect a disallowed Origin", () => {
    const req = mockReq({ origin: "https://evil.example" })
    const res = mockRes()
    setCorsAndPna(req, res, new Set(["http://localhost:5173"]))
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("sets Private-Network header when requested", () => {
    const req = mockReq({
      origin: "http://localhost:5173",
      "access-control-request-private-network": "true",
    })
    const res = mockRes()
    setCorsAndPna(req, res, new Set(["http://localhost:5173"]))
    expect(res.headers["access-control-allow-private-network"]).toBe("true")
  })
})

describe("readBearerToken", () => {
  it("parses Bearer tokens", () => {
    expect(readBearerToken(mockReq({ authorization: "Bearer abc-123" }))).toBe("abc-123")
  })

  it("returns undefined without Authorization", () => {
    expect(readBearerToken(mockReq({}))).toBeUndefined()
  })
})
