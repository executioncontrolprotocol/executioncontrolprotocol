import { describe, expect, it } from "vitest"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import {
  handleArtifactGet,
  sanitizeArtifactFilename,
} from "../../src/lib/http/handle-artifact.js"

function createRes(): {
  res: ServerResponse
  statusCode: number
  body: Buffer | string
  headers: Record<string, string>
} {
  let statusCode = 200
  let body: Buffer | string = ""
  const headers: Record<string, string> = {}
  const res = {
    headersSent: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value)
      return this
    },
    writeHead(code: number, hdrs?: Record<string, string | number>) {
      statusCode = code
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = String(v)
      }
      return this
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) body = chunk
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
    headers,
  }
}

function createReq(url: string): IncomingMessage {
  const stream = Readable.from([]) as IncomingMessage
  stream.method = "GET"
  stream.url = url
  stream.headers = { host: "127.0.0.1" }
  return stream
}

describe("sanitizeArtifactFilename", () => {
  it("strips path separators and quotes", () => {
    expect(sanitizeArtifactFilename('a/"b\\c', "ecp://artifacts/x")).toBe("a_bc")
  })

  it("falls back to uri basename", () => {
    expect(sanitizeArtifactFilename(undefined, "ecp://artifacts/images/out.webp")).toBe(
      "out.webp"
    )
  })
})

describe("handleArtifactGet", () => {
  it("returns 400 when uri is missing", async () => {
    const ecp = { getArtifactStore: () => ({ get: () => undefined }) }
    const out = createRes()
    await handleArtifactGet(ecp as never, createReq("/v1/artifacts"), out.res)
    expect(out.statusCode).toBe(400)
  })

  it("returns 404 when artifact is missing", async () => {
    const ecp = { getArtifactStore: () => ({ get: () => undefined }) }
    const out = createRes()
    await handleArtifactGet(
      ecp as never,
      createReq("/v1/artifacts?uri=" + encodeURIComponent("ecp://artifacts/missing")),
      out.res
    )
    expect(out.statusCode).toBe(404)
  })

  it("serves bytes with Content-Type and inline disposition", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const ecp = {
      getArtifactStore: () => ({
        get: (uri: string) =>
          uri === "ecp://artifacts/images/a.webp"
            ? { mediaType: "image/webp", name: "a.webp", size: 4, bytes }
            : undefined,
      }),
    }
    const out = createRes()
    await handleArtifactGet(
      ecp as never,
      createReq(
        "/v1/artifacts?uri=" + encodeURIComponent("ecp://artifacts/images/a.webp")
      ),
      out.res
    )
    expect(out.statusCode).toBe(200)
    expect(out.headers["content-type"]).toBe("image/webp")
    expect(out.headers["content-disposition"]).toContain('filename="a.webp"')
    expect(out.headers["cache-control"]).toBe("no-store")
    expect(Buffer.isBuffer(out.body) ? Array.from(out.body) : []).toEqual([1, 2, 3, 4])
  })
})
