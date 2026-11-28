import { describe, expect, it } from "vitest"
import { hostUnavailableEnvelope, isHostUnavailableError } from "../../src/lib/host-unavailable.js"

describe("hostUnavailableEnvelope", () => {
  it("strips the ECP_HOST_UNAVAILABLE prefix from the message", () => {
    const error = Object.assign(new Error("ECP_HOST_UNAVAILABLE: host is down"), {
      suggestions: ["Run ecp host start"],
    })
    const envelope = hostUnavailableEnvelope(error)
    expect(envelope.ok).toBe(false)
    if (envelope.ok) return
    expect(envelope.error.code).toBe("ECP_HOST_UNAVAILABLE")
    expect(envelope.error.message).toBe("host is down")
    expect(envelope.error.suggestions).toEqual(["Run ecp host start"])
  })

  it("keeps a plain message without the prefix", () => {
    const envelope = hostUnavailableEnvelope(new Error("connection refused"))
    expect(envelope.ok).toBe(false)
    if (envelope.ok) return
    expect(envelope.error.message).toBe("connection refused")
  })
})

describe("isHostUnavailableError", () => {
  it("returns true when code is ECP_HOST_UNAVAILABLE", () => {
    expect(isHostUnavailableError({ code: "ECP_HOST_UNAVAILABLE" })).toBe(true)
  })

  it("returns false for other errors", () => {
    expect(isHostUnavailableError(null)).toBe(false)
    expect(isHostUnavailableError({ code: "ECP_VALIDATION" })).toBe(false)
    expect(isHostUnavailableError(new Error("nope"))).toBe(false)
  })
})