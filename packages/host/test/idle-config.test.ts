import { describe, expect, it } from "vitest"
import { resolveIdleConfigFromEnv } from "../src/idle-config.js"

describe("resolveIdleConfigFromEnv", () => {
  it("defaults to 15 minutes and explicit start", () => {
    expect(resolveIdleConfigFromEnv({})).toEqual({
      idleMinutes: 15,
      idleMs: 15 * 60_000,
      startedBy: "explicit",
    })
  })

  it("honours ECP_HOST_IDLE_MS including zero and invalid", () => {
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "120000" })).toEqual({
      idleMinutes: 2,
      idleMs: 120_000,
      startedBy: "explicit",
    })
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "90001" }).idleMinutes).toBe(2)
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "0" }).idleMs).toBe(0)
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "nope" }).idleMs).toBe(15 * 60_000)
  })

  it("honours ECP_HOST_IDLE_MINUTES and auto start", () => {
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MINUTES: "0", ECP_HOST_STARTED_BY: "auto" })).toEqual({
      idleMinutes: 0,
      idleMs: 0,
      startedBy: "auto",
    })
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MINUTES: "bad" }).idleMinutes).toBe(15)
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MINUTES: "", ECP_HOST_IDLE_MS: "" }).idleMinutes).toBe(15)
  })

  it("treats blank idle env as unset", () => {
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "   " }).idleMinutes).toBe(15)
    expect(resolveIdleConfigFromEnv({ ECP_HOST_STARTED_BY: "other" }).startedBy).toBe("explicit")
  })

  it("clamps negative idle values to zero", () => {
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MINUTES: "-3" }).idleMinutes).toBe(0)
    expect(resolveIdleConfigFromEnv({ ECP_HOST_IDLE_MS: "-100" }).idleMs).toBe(0)
  })
})