import type { RunEvent, RunEventType } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  applyRunEvent,
  armRunState,
  createRunGraphState,
  reduceRunEvent,
  replayRunEvents,
  ReactFlowRunProgress,
  reactFlowRunProgress,
} from "../../src/graph/index.js"

let seq = 0
function ev(type: RunEventType, data: Record<string, unknown> = {}): RunEvent {
  seq += 1
  return { seq, at: new Date(0).toISOString(), type, data }
}

function record(bus: ReactFlowRunProgress): Array<[string, unknown]> {
  const seen: Array<[string, unknown]> = []
  for (const name of ["run:reset", "step:status", "arm:status", "loop:round", "run:done"]) {
    bus.addEventListener(name, (event) => seen.push([name, (event as CustomEvent).detail]))
  }
  return seen
}

describe("reduceRunEvent / replayRunEvents", () => {
  it("tracks step statuses through a completed run", () => {
    const state = replayRunEvents([
      ev("run.start", { manifestHash: "h", input: {} }),
      ev("step.start", { nodeId: "a", capabilityId: "@x/p.c" }),
      ev("step.end", { nodeId: "a", durationMs: 3, as: "a" }),
      ev("step.skip", { nodeId: "b" }),
      ev("run.end", { status: "completed", durationMs: 5 }),
    ])
    expect(state.status).toBe("completed")
    expect(state.steps).toEqual({ a: { status: "completed" }, b: { status: "skipped" } })
    expect(state.lastSeq).toBe(seq)
  })

  it("records failure messages and cancels steps left running", () => {
    const state = replayRunEvents([
      ev("run.start"),
      ev("step.start", { nodeId: "left" }),
      ev("step.start", { nodeId: "right" }),
      ev("step.error", { nodeId: "left", error: { code: "ECP_STEP_FAILED", message: "boom" } }),
      ev("run.end", { status: "failed", error: { code: "ECP_STEP_FAILED" } }),
    ])
    expect(state.status).toBe("failed")
    expect(state.steps.left).toEqual({ status: "failed", message: "boom" })
    expect(state.steps.right).toEqual({ status: "cancelled" })
  })

  it("maps a step.error with ECP_RUN_CANCELLED to cancelled and a missing error to failed", () => {
    const state = replayRunEvents([
      ev("run.start"),
      ev("step.error", { nodeId: "a", error: { code: "ECP_RUN_CANCELLED", message: "stop" } }),
      ev("step.error", { nodeId: "b" }),
    ])
    expect(state.steps.a?.status).toBe("cancelled")
    expect(state.steps.b).toEqual({ status: "failed" })
  })

  it("tracks loop rounds and exhaustion, with the round on steps", () => {
    const state = replayRunEvents([
      ev("run.start"),
      ev("loop.round", { nodeId: "refine", round: 0 }),
      ev("step.start", { nodeId: "tick", round: 0 }),
      ev("step.end", { nodeId: "tick", round: 0 }),
      ev("loop.round", { nodeId: "refine", round: 1 }),
      ev("step.start", { nodeId: "tick", round: 1 }),
      ev("step.end", { nodeId: "tick", round: 1 }),
      ev("loop.exhausted", { nodeId: "refine", rounds: 2 }),
    ])
    expect(state.loops.refine).toEqual({ round: 1, exhausted: true })
    expect(state.steps.tick).toEqual({ status: "completed", round: 1 })
    expect(state.status).toBe("running")
  })

  it("loop.exhausted without a prior round infers the last round", () => {
    const state = reduceRunEvent(createRunGraphState(), ev("loop.exhausted", { nodeId: "l", rounds: 3 }))
    expect(state.loops.l).toEqual({ round: 2, exhausted: true })
    const zero = reduceRunEvent(createRunGraphState(), ev("loop.exhausted", { nodeId: "l" }))
    expect(zero.loops.l).toEqual({ round: 0, exhausted: true })
  })

  it("records branch selection, including no arm", () => {
    const state = replayRunEvents([
      ev("run.start"),
      ev("branch.select", { nodeId: "route", arm: 1 }),
      ev("branch.select", { nodeId: "other", arm: null }),
    ])
    expect(state.arms).toEqual({ route: 1, other: null })
  })

  it("run.start resets earlier state; interrupt and resume update the status", () => {
    let state = replayRunEvents([ev("run.start"), ev("step.start", { nodeId: "a" })])
    state = reduceRunEvent(state, ev("run.interrupted", { reason: "host-restart" }))
    expect(state.status).toBe("interrupted")
    expect(state.steps.a?.status).toBe("cancelled")
    state = reduceRunEvent(state, ev("run.resume", { rerunNodeId: "a" }))
    expect(state.status).toBe("running")
    state = reduceRunEvent(state, ev("run.start"))
    expect(state.steps).toEqual({})
  })

  it("maps run.end statuses, defaulting unknown ones to completed", () => {
    for (const status of ["completed", "failed", "cancelled", "interrupted"]) {
      expect(reduceRunEvent(createRunGraphState(), ev("run.end", { status })).status).toBe(status)
    }
    expect(reduceRunEvent(createRunGraphState(), ev("run.end", { status: "weird" })).status).toBe("completed")
  })

  it("ignores events without a node id or with bad fields", () => {
    const start = createRunGraphState()
    for (const type of [
      "step.start",
      "step.skip",
      "step.end",
      "step.error",
      "branch.select",
      "loop.round",
      "loop.exhausted",
      "forEach.start",
      "forEach.item.start",
      "forEach.item.end",
      "forEach.item.error",
      "forEach.end",
    ] as const) {
      const next = reduceRunEvent(start, ev(type, {}))
      expect(next.steps).toEqual({})
      expect(next.arms).toEqual({})
      expect(next.loops).toEqual({})
    }
    expect(reduceRunEvent(start, ev("loop.round", { nodeId: "l", round: "1" })).loops).toEqual({})
    expect(reduceRunEvent(start, ev("branch.select", { nodeId: "b", arm: "x" })).arms).toEqual({ b: null })
    const unknown = { seq: 99, at: "", type: "custom.thing", data: {} } as unknown as RunEvent
    expect(reduceRunEvent(start, unknown).lastSeq).toBe(99)
    const noData = { seq: 100, at: "", type: "step.start" } as unknown as RunEvent
    expect(reduceRunEvent(start, noData).steps).toEqual({})
  })

  it("replays out-of-order events in seq order", () => {
    const a = ev("run.start")
    const b = ev("step.start", { nodeId: "x" })
    const c = ev("step.end", { nodeId: "x" })
    expect(replayRunEvents([c, a, b]).steps.x?.status).toBe("completed")
  })
})

describe("armRunState", () => {
  const state = replayRunEvents([
    ev("run.start"),
    ev("branch.select", { nodeId: "br", arm: 0 }),
    ev("loop.round", { nodeId: "lp", round: 0 }),
  ])

  it("marks the selected arm taken and the others skipped", () => {
    expect(armRunState({ route: "branch", structureId: "br", armIndex: 0 }, state)).toBe("taken")
    expect(armRunState({ route: "branch", structureId: "br", armIndex: 1 }, state)).toBe("skipped")
  })

  it("is idle before selection, for parallel lines and for loops that never ran", () => {
    expect(armRunState({ route: "branch", structureId: "other", armIndex: 0 }, state)).toBe("idle")
    expect(armRunState({ route: "parallel", structureId: "p", armIndex: 0 }, state)).toBe("idle")
    expect(armRunState({ route: "loop", structureId: "lp" }, state)).toBe("taken")
    expect(armRunState({ route: "loop", structureId: "nope" }, state)).toBe("idle")
  })
})

describe("applyRunEvent", () => {
  it("emits bus events for every event type", () => {
    const bus = new ReactFlowRunProgress()
    const seen = record(bus)
    applyRunEvent(bus, ev("run.start"), "run-1")
    applyRunEvent(bus, ev("step.start", { nodeId: "a", round: 0 }))
    applyRunEvent(bus, ev("step.skip", { nodeId: "b" }))
    applyRunEvent(bus, ev("step.end", { nodeId: "a" }))
    applyRunEvent(bus, ev("step.error", { nodeId: "c", error: { code: "ECP_STEP_FAILED", message: "bad" } }))
    applyRunEvent(bus, ev("step.error", { nodeId: "d", error: { code: "ECP_RUN_CANCELLED" } }))
    applyRunEvent(bus, ev("branch.select", { nodeId: "br", arm: 1 }))
    applyRunEvent(bus, ev("branch.select", { nodeId: "br2", arm: null }))
    applyRunEvent(bus, ev("loop.round", { nodeId: "lp", round: 2 }))
    applyRunEvent(bus, ev("loop.exhausted", { nodeId: "lp", rounds: 3 }))
    applyRunEvent(bus, ev("run.interrupted", { reason: "host-crash" }))
    applyRunEvent(bus, ev("run.end", { status: "failed" }), "run-1")
    expect(seen).toEqual([
      ["run:reset", { runId: "run-1" }],
      ["step:status", { stepId: "a", status: "running", round: 0 }],
      ["step:status", { stepId: "b", status: "skipped" }],
      ["step:status", { stepId: "a", status: "completed" }],
      ["step:status", { stepId: "c", status: "failed", message: "bad" }],
      ["step:status", { stepId: "d", status: "cancelled" }],
      ["arm:status", { structureId: "br", arm: 1 }],
      ["arm:status", { structureId: "br2", arm: null }],
      ["loop:round", { structureId: "lp", round: 2 }],
      ["loop:round", { structureId: "lp", round: 2, exhausted: true }],
      ["run:done", { outcome: "interrupted" }],
      ["run:done", { runId: "run-1", outcome: "failed" }],
    ])
  })

  it("emits nothing for events missing their node id or round, or for run.resume", () => {
    const bus = new ReactFlowRunProgress()
    const seen = record(bus)
    for (const type of ["step.start", "step.skip", "step.end", "step.error", "branch.select", "loop.round", "loop.exhausted", "run.resume"] as const) {
      applyRunEvent(bus, ev(type, {}))
    }
    applyRunEvent(bus, ev("loop.round", { nodeId: "l" }))
    applyRunEvent(bus, { seq: 1, at: "", type: "run.start" } as unknown as RunEvent)
    applyRunEvent(bus, ev("loop.exhausted", { nodeId: "l" }))
    expect(seen).toEqual([
      ["run:reset", {}],
      ["loop:round", { structureId: "l", round: 0, exhausted: true }],
    ])
  })

  it("shared bus defaults to empty lifecycle details", () => {
    const seen = record(reactFlowRunProgress)
    reactFlowRunProgress.emitReset()
    reactFlowRunProgress.emitDone()
    expect(seen).toEqual([
      ["run:reset", {}],
      ["run:done", {}],
    ])
  })
})
