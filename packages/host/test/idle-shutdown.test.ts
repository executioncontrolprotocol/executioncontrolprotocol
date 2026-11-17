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
})