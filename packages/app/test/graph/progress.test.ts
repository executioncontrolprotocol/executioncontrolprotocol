import { describe, expect, it } from "vitest"
import { ReactFlowRunProgress, reactFlowRunProgress } from "../../src/graph/progress.js"

describe("ReactFlowRunProgress", () => {
  it("emits lifecycle, step, if, and loop events", () => {
    const bus = new ReactFlowRunProgress()
    const seen: string[] = []
    bus.addEventListener("run:reset", () => seen.push("reset"))
    bus.addEventListener("run:done", () => seen.push("done"))
    bus.addEventListener("step:status", (event) => seen.push(`step:${(event as CustomEvent).detail.status}`))
    bus.addEventListener("if:choice", () => seen.push("if"))
    bus.addEventListener("loop:round", () => seen.push("round"))
    bus.addEventListener("loop:progress", () => seen.push("progress"))
    bus.emitReset({ runId: "r" })
    bus.emitStepStatus("s", "running", { round: 0 })
    bus.emitIfChoice("g", "then")
    bus.emitLoopRound("L", 2, true)
    bus.emitLoopProgress("fe", 1, 3, 0)
    bus.emitDone({ outcome: "completed", runId: "r" })
    expect(seen).toEqual(["reset", "step:running", "if", "round", "progress", "done"])
    expect(bus.currentLoopItems("fe")).toEqual({ count: 3, done: 1, failed: 0 })
    bus.emitReset()
    expect(bus.currentLoopItems("fe")).toBeUndefined()
  })

  it("emits loop round without exhausted and progress without failed", () => {
    const bus = new ReactFlowRunProgress()
    bus.emitLoopRound("L", 1)
    bus.emitLoopProgress("fe", 0, 2)
    expect(bus.currentLoopItems("fe")).toEqual({ count: 2, done: 0 })
  })

  it("exposes the shared singleton bus", () => {
    expect(reactFlowRunProgress).toBeInstanceOf(ReactFlowRunProgress)
  })
})