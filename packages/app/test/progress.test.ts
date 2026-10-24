import { describe, expect, it, vi } from "vitest"
import { ReactFlowRunProgress } from "../src/graph/progress.js"
import { applyPublicRunEvent } from "../src/graph/map-run-events.js"
import type { PublicRunEvent } from "@executioncontrolprotocol/core/types"

function event(partial: Omit<PublicRunEvent, "ts">): PublicRunEvent {
  return { ts: "2026-01-01T00:00:00.000Z", ...partial }
}

describe("applyPublicRunEvent", () => {
  it("maps run.start to reset and run.end to done", () => {
    const bus = new ReactFlowRunProgress()
    const onReset = vi.fn()
    const onDone = vi.fn()
    bus.addEventListener("run:reset", onReset)
    bus.addEventListener("run:done", onDone)
    applyPublicRunEvent(bus, event({ type: "run.start", runId: "r1" }))
    applyPublicRunEvent(bus, event({ type: "run.end", runId: "r1", status: "completed" }))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("maps step.start / step.end / step.error", () => {
    const bus = new ReactFlowRunProgress()
    const seen: string[] = []
    bus.addEventListener("step:status", (raw) => {
      const detail = (raw as CustomEvent<{ stepId: string; status: string; message?: string }>)
        .detail
      seen.push(`${detail.stepId}:${detail.status}:${detail.message ?? ""}`)
    })
    applyPublicRunEvent(
      bus,
      event({ type: "step.start", runId: "r1", stepId: "echo" })
    )
    applyPublicRunEvent(
      bus,
      event({ type: "step.end", runId: "r1", stepId: "echo", status: "completed" })
    )
    applyPublicRunEvent(
      bus,
      event({
        type: "step.error",
        runId: "r1",
        stepId: "fail",
        error: { message: "boom" },
      })
    )
    expect(seen).toEqual(["echo:running:", "echo:completed:", "fail:failed:boom"])
  })

  it("ignores step.policy events", () => {
    const bus = new ReactFlowRunProgress()
    const onStatus = vi.fn()
    bus.addEventListener("step:status", onStatus)
    applyPublicRunEvent(bus, event({ type: "step.policy", runId: "r1", stepId: "echo" }))
    expect(onStatus).not.toHaveBeenCalled()
  })
})
