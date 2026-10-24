import { afterEach, describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID } from "@executioncontrolprotocol/core/types"
import {
  generateBearerToken,
  serveHttp,
  type HttpServeHandle,
} from "../src/serve-http.js"
import { DEFAULT_MCP_PATH } from "../src/constants.js"
import { testHost } from "./host.js"
import type { Ecp } from "@executioncontrolprotocol/core"

describe("generateBearerToken", () => {
  it("returns 64 hex characters", () => {
    expect(generateBearerToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it("returns a different token each call", () => {
    expect(generateBearerToken()).not.toBe(generateBearerToken())
  })
})

describe("serveHttp", () => {
  let ecp: Ecp | undefined
  let handle: HttpServeHandle | undefined

  afterEach(async () => {
    await handle?.close()
    handle = undefined
    await ecp?.terminate()
    ecp = undefined
  })

  it("binds 127.0.0.1 by default and requires a bearer token", async () => {
    const ctx = await testHost()
    ecp = ctx.ecp
    const token = "unit-test-token"
    handle = await serveHttp({
      host: ctx.host,
      httpPort: 0,
      token,
      printToken: false,
    })
    expect(handle.host).toBe("127.0.0.1")
    expect(handle.path).toBe(DEFAULT_MCP_PATH)
    expect(handle.port).toBeGreaterThan(0)

    const url = `http://127.0.0.1:${handle.port}${handle.path}`
    const missing = await fetch(url, { method: "POST", body: "{}" })
    expect(missing.status).toBe(401)

    const wrong = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
      body: "{}",
    })
    expect(wrong.status).toBe(401)

    const ok = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "http-test", version: "1.0.0" },
        },
      }),
    })
    expect(ok.status).not.toBe(401)
    expect(ok.status).not.toBe(404)
  })

  it("rejects a non-loopback bind without --allow-remote", async () => {
    const ctx = await testHost()
    ecp = ctx.ecp
    await expect(
      serveHttp({
        host: ctx.host,
        httpHost: "0.0.0.0",
        httpPort: 0,
        printToken: false,
      })
    ).rejects.toMatchObject({ code: ECP_INPUT_INVALID })
  })

  it("does not print the token when printToken is false", async () => {
    const ctx = await testHost()
    ecp = ctx.ecp
    const writes: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      writes.push(String(chunk))
      return (original as (chunk: string | Uint8Array, ...args: unknown[]) => boolean)(
        chunk,
        ...rest
      )
    }) as typeof process.stderr.write
    try {
      handle = await serveHttp({
        host: ctx.host,
        httpPort: 0,
        token: "must-not-appear",
        printToken: false,
      })
      expect(writes.join("")).not.toMatch(/must-not-appear/)
    } finally {
      process.stderr.write = original
    }
  })
})
