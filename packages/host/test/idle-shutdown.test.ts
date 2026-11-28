import { describe, expect, it } from "vitest"
import { decideIdleShutdown } from "../src/idle-shutdown.js"

describe("decideIdleShutdown", () => {
  const base = {
    idleMs: 60_000,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    activeRuns: 0,
    openStreams: 0,
    hostHealthy: true,
    stopping: false,
  }

  it("never stops when idle is disabled", () => {
    expect(decideIdleShutdown({ ...base, idleMs: 0 }).shouldIdleStop).toBe(false)
  })

  it("blocks while runs are active", () => {
    const decision = decideIdleShutdown({ ...base, activeRuns: 1 })
    expect(decision.shouldIdleStop).toBe(false)
    expect(decision.idleBlockedBy).toBe("run")
  })

  it("blocks while streams are open", () => {
    const decision = decideIdleShutdown({ ...base, openStreams: 2 })
    expect(decision.shouldIdleStop).toBe(false)
    expect(decision.idleBlockedBy).toBe("stream")
  })

  it("stops after the idle deadline", () => {
    const decision = decideIdleShutdown({
      ...base,
      nowMs: Date.parse("2026-01-01T00:02:00.000Z"),
    })
    expect(decision.shouldIdleStop).toBe(true)
  })

  it("does not stop while the supervisor is shutting down or the host is unhealthy", () => {
    expect(decideIdleShutdown({ ...base, stopping: true }).shouldIdleStop).toBe(false)
    expect(decideIdleShutdown({ ...base, hostHealthy: false }).shouldIdleStop).toBe(false)
  })

  it("does not schedule shutdown without a last activity time", () => {
    const decision = decideIdleShutdown({ ...base, lastActivityAt: undefined, nowMs: 0 })
    expect(decision.shouldIdleStop).toBe(false)
    expect(decision.idleShutdownAt).toBeNull()
  })

  it("exposes the idle shutdown instant before the deadline", () => {
    const decision = decideIdleShutdown({
      ...base,
      nowMs: Date.parse("2026-01-01T00:00:30.000Z"),
    })
    expect(decision.shouldIdleStop).toBe(false)
    expect(decision.idleShutdownAt).toBe("2026-01-01T00:01:00.000Z")
  })

  it("ignores an unparseable last activity time", () => {
    const decision = decideIdleShutdown({
      ...base,
      lastActivityAt: "not-a-date",
      nowMs: 9_999_999_999,
    })
    expect(decision.shouldIdleStop).toBe(false)
    expect(decision.idleShutdownAt).toBeNull()
  })
})