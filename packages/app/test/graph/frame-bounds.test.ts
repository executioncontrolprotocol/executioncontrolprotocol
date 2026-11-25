import { describe, expect, it } from "vitest"
import { frameBounds, FRAME_PADDING, type FrameMembership } from "../../src/graph/layout.js"

function step(id: string, x: number, y: number) {
  return {
    id,
    type: "ecp-step" as const,
    position: { x, y },
    style: { width: 260 },
    data: { inputs: [{ id: "in" }], outputs: [{ id: "out" }] },
  }
}

describe("frameBounds", () => {
  it("grows the frame when a body node moves outward", () => {
    const nodes = [step("a", 0, 0), step("b", 300, 40)]
    const frames: FrameMembership[] = [
      { frameId: "ecp:frame:loop", memberNodeIds: ["a", "b"], childFrameIds: [], depth: 0 },
    ]
    const before = frameBounds(nodes, frames)!
    const moved = [step("a", 0, 0), step("b", 700, 40)]
    const after = frameBounds(moved, frames)!
    expect(after.get("ecp:frame:loop")!.width - before.get("ecp:frame:loop")!.width).toBe(400)
    const rect = after.get("ecp:frame:loop")!
    expect(rect.x).toBe(-FRAME_PADDING.x)
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(700 + 260 + FRAME_PADDING.x)
  })

  it("keeps nested frames inside the outer padding union", () => {
    const nodes = [step("outer", 0, 0), step("inner", 120, 100)]
    const frames: FrameMembership[] = [
      { frameId: "ecp:frame:inner", memberNodeIds: ["inner"], childFrameIds: [], depth: 1 },
      { frameId: "ecp:frame:outer", memberNodeIds: ["outer"], childFrameIds: ["ecp:frame:inner"], depth: 0 },
    ]
    const base = frameBounds(nodes, frames)
    const extended = [step("outer", 0, 0), step("inner", 620, 140)]
    const rects = frameBounds(extended, frames)
    const outer = rects.get("ecp:frame:outer")!
    const inner = rects.get("ecp:frame:inner")!
    expect(outer.x).toBeLessThanOrEqual(inner.x)
    expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width)
    expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height)
    expect(inner.x).toBeGreaterThan(base.get("ecp:frame:inner")!.x)
    expect(inner.x + inner.width).toBeGreaterThan(base.get("ecp:frame:inner")!.x + base.get("ecp:frame:inner")!.width)
  })

  it("skips unknown members and omits empty frames", () => {
    const nodes = [step("only", 50, 50)]
    const empty = frameBounds(nodes, [{ frameId: "f", memberNodeIds: ["gone"], childFrameIds: [], depth: 0 }])
    expect(empty.has("f")).toBe(false)
    const padded = frameBounds(nodes, [{ frameId: "f", memberNodeIds: ["only", "gone"], childFrameIds: [], depth: 0 }])
    expect(padded.has("f")).toBe(true)
  })
})