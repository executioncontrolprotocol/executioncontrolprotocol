import { describe, expect, it } from "vitest"
import { publicRunEvent } from "../../src/types/run-events.js"

describe("public run events", () => {
  it("fills type, runId and timestamp", () => {
    const event = publicRunEvent("step.end", "run-1", { stepId: "echo", status: "completed" })
    expect(event.type).toBe("step.end")
    expect(event.runId).toBe("run-1")
    expect(event.stepId).toBe("echo")
    expect(event.ts).toMatch(/^\d{4}-/)
  })
})
