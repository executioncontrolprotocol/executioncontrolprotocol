import { describe, expect, it } from "vitest"
import { progressFromRunEvent } from "../src/progress.js"

describe("progressFromRunEvent", () => {
  it("returns undefined when events is false or missing", () => {
    const extra = { sendNotification: async () => undefined }
    expect(progressFromRunEvent(extra, false)).toBeUndefined()
    expect(progressFromRunEvent(extra, undefined)).toBeUndefined()
  })

  it("returns undefined when the client did not send a progress token", () => {
    const extra = { _meta: {}, sendNotification: async () => undefined }
    expect(progressFromRunEvent(extra, true)).toBeUndefined()
  })

  it("does not resolve until sendNotification finishes", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const extra = {
      _meta: { progressToken: "tok-wait" },
      sendNotification: async () => {
        await gate
      },
    }
    const onEvent = progressFromRunEvent(extra, true)
    const pending = onEvent?.({ type: "run.end", runId: "r", ts: "t" })
    let settled = false
    void pending?.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await pending
    expect(settled).toBe(true)
  })

  it("emits numbered progress notifications from run events", async () => {
    const sent: unknown[] = []
    const extra = {
      _meta: { progressToken: "tok-1" },
      sendNotification: async (notification: unknown) => {
        sent.push(notification)
      },
    }
    const onEvent = progressFromRunEvent(extra, true)
    expect(onEvent).toBeTypeOf("function")
    await onEvent?.({ type: "run.start", runId: "r", ts: "t" })
    await onEvent?.({ type: "run.end", runId: "r", ts: "t" })
    expect(sent).toEqual([
      {
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 1, message: "run.start" },
      },
      {
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 2, message: "run.end" },
      },
    ])
  })
})
