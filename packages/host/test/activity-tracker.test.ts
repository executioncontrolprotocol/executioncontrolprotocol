import { describe, expect, it } from "vitest"
import { HostActivityTracker } from "../src/activity-tracker.js"

describe("HostActivityTracker", () => {
  it("tracks watch streams and idle touches", () => {
    const tracker = new HostActivityTracker("2026-01-01T00:00:00.000Z")
    tracker.streamOpened()
    expect(tracker.snapshot().openStreams).toBe(1)
    tracker.streamClosed()
    expect(tracker.snapshot().openStreams).toBe(0)
    expect(tracker.snapshot().lastActivityAt).not.toBe("2026-01-01T00:00:00.000Z")
  })
})