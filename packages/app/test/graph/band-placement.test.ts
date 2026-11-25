import type { ExecutionManifest, Node, StepNode } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  executionToReactFlow,
  frameAtFlowPoint,
  placementAtFlowPoint,
  type ReactFlowDocument,
  type ReactFlowFrameData,
} from "../../src/graph/index.js"

const echo = "@executioncontrolprotocol/test.echo"

function step(id: string, extra: Partial<StepNode> = {}): StepNode {
  return { id, uses: echo, input: { value: id }, as: id, ...extra }
}

function manifestOf(...steps: Node[]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
}

const nested = manifestOf(
  step("first"),
  {
    type: "if",
    id: "gate",
    expression: "true",
    then: [
      step("t1"),
      step("t2"),
      {
        type: "loop",
        id: "inner",
        mode: "for",
        as: "i",
        input: { count: 2 },
        steps: [step("deep", { mode: "replace" })],
        end: { input: {} },
      },
    ],
    else: [step("e1")],
  },
  { type: "parallel", id: "fan", paths: [[step("p1a"), step("p1b")], [step("p2a")]] },
  step("last"),
)

function position(doc: ReactFlowDocument, id: string): { x: number; y: number } {
  const hit = doc.nodes.find((node) => node.id === id)
  if (!hit) throw new Error(`no node ${id}`)
  return hit.position
}

/** X just inside the right edge of a container, so a cursor there is right of every node in it. */
function rightEdge(doc: ReactFlowDocument, structureId: string): number {
  const frame = doc.nodes.find((node) => node.id === `ecp:frame:${structureId}`)
  if (!frame) throw new Error(`no frame ${structureId}`)
  return frame.position.x + (frame.style?.width ?? 0) - 1
}

describe("frameAtFlowPoint", () => {
  const doc = executionToReactFlow(nested)

  it("returns the innermost container holding the point", () => {
    const deep = position(doc, "deep")
    const hit = frameAtFlowPoint(doc, { x: deep.x + 10, y: deep.y + 10 })
    expect(hit?.data.structureId).toBe("inner")
  })

  it("returns the outer container for a point inside it but outside the inner one", () => {
    const e1 = position(doc, "e1")
    expect(frameAtFlowPoint(doc, { x: e1.x + 10, y: e1.y + 10 })?.data.structureId).toBe("gate")
  })

  it("returns undefined outside every container", () => {
    const first = position(doc, "first")
    expect(frameAtFlowPoint(doc, { x: first.x + 5, y: first.y + 5 })).toBeUndefined()
    expect(frameAtFlowPoint(doc, { x: -100000, y: -100000 })).toBeUndefined()
  })
})

describe("placementAtFlowPoint", () => {
  const doc = executionToReactFlow(nested)

  it("is undefined outside every container, so the caller uses the top level", () => {
    const last = position(doc, "last")
    expect(placementAtFlowPoint(nested, doc, { x: last.x + 5, y: last.y + 5 })).toBeUndefined()
  })

  it("adds at the start of the then side left of its first node", () => {
    const t1 = position(doc, "t1")
    expect(placementAtFlowPoint(nested, doc, { x: t1.x - 1, y: t1.y + 5 })).toEqual({ kind: "then-side", ifId: "gate" })
  })

  it("adds after the then node left of the cursor", () => {
    const t1 = position(doc, "t1")
    const t2 = position(doc, "t2")
    const between = (t1.x + t2.x) / 2 + 130
    expect(placementAtFlowPoint(nested, doc, { x: between, y: t1.y + 5 })).toEqual({ kind: "after", nodeId: "t1" })
  })

  it("adds into the else band when the cursor is nearest to it", () => {
    const e1 = position(doc, "e1")
    expect(placementAtFlowPoint(nested, doc, { x: e1.x - 1, y: e1.y + 5 })).toEqual({ kind: "else-side", ifId: "gate" })
    expect(placementAtFlowPoint(nested, doc, { x: rightEdge(doc, "gate"), y: e1.y + 5 })).toEqual({ kind: "after", nodeId: "e1" })
  })

  it("adds into the path nearest the cursor", () => {
    const p2 = position(doc, "p2a")
    expect(placementAtFlowPoint(nested, doc, { x: p2.x - 1, y: p2.y + 5 })).toEqual({
      kind: "path-side",
      parallelId: "fan",
      pathIndex: 1,
    })
    const p1 = position(doc, "p1a")
    expect(placementAtFlowPoint(nested, doc, { x: p1.x - 1, y: p1.y + 5 })).toEqual({
      kind: "path-side",
      parallelId: "fan",
      pathIndex: 0,
    })
  })

  it("adds into the loop body for a point inside the loop, ahead of or after its nodes", () => {
    const deep = position(doc, "deep")
    expect(placementAtFlowPoint(nested, doc, { x: deep.x - 1, y: deep.y + 5 })).toEqual({ kind: "loop-body", loopId: "inner" })
    expect(placementAtFlowPoint(nested, doc, { x: rightEdge(doc, "inner"), y: deep.y + 5 })).toEqual({ kind: "after", nodeId: "deep" })
  })

  it("treats a missing structure as the top level", () => {
    const stale = manifestOf(step("first"))
    const deep = position(doc, "deep")
    expect(placementAtFlowPoint(stale, doc, { x: deep.x, y: deep.y + 5 })).toBeUndefined()
  })

  it("keeps every frame data id a structure id", () => {
    const frames = doc.nodes.filter((node) => node.type === "ecp-frame").map((node) => (node.data as ReactFlowFrameData).structureId)
    expect(frames.sort()).toEqual(["fan", "gate", "inner"])
  })
})
