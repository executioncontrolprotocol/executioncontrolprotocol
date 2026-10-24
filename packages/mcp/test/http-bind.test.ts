import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID } from "@executioncontrolprotocol/core/types"
import { assertHttpBind, isLoopbackAddress } from "../src/http-bind.js"

describe("isLoopbackAddress", () => {
  it("accepts IPv4 loopback, localhost, and IPv6 loopback", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true)
    expect(isLoopbackAddress("127.0.0.2")).toBe(true)
    expect(isLoopbackAddress("localhost")).toBe(true)
    expect(isLoopbackAddress("::1")).toBe(true)
    expect(isLoopbackAddress("[::1]")).toBe(true)
  })

  it("rejects non-loopback binds", () => {
    expect(isLoopbackAddress("0.0.0.0")).toBe(false)
    expect(isLoopbackAddress("::")).toBe(false)
    expect(isLoopbackAddress("192.168.1.1")).toBe(false)
    expect(isLoopbackAddress("example.com")).toBe(false)
  })
})

describe("assertHttpBind", () => {
  it("allows loopback without --allow-remote", () => {
    expect(() => assertHttpBind("127.0.0.1", false)).not.toThrow()
  })

  it("rejects a non-loopback bind without --allow-remote", () => {
    try {
      assertHttpBind("0.0.0.0", false)
      throw new Error("expected EcpError")
    } catch (err) {
      expect(err).toMatchObject({ code: ECP_INPUT_INVALID })
    }
  })

  it("allows a non-loopback bind with --allow-remote", () => {
    expect(() => assertHttpBind("0.0.0.0", true)).not.toThrow()
  })
})
