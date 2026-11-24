import { describe, expect, it } from "vitest"
import {
  parsePositionOverrides,
  placeWithOverrides,
  positionStorageKey,
  prunePositionOverrides,
} from "../../src/graph/positions.js"
import type { ReactFlowDocument, ReactFlowFrameData, ReactFlowNode } from "../../src/graph/types.js"

function frameNode(id: string, members: string[], childFrameIds: string[], depth: number): ReactFlowNode {
  return {
    id,
    type: "ecp-frame",
    position: { x: 0, y: 0 },
    style: { width: 400, height: 300, pointerEvents: "none" },
    data: {
      structureId: id,
      structureKind: "loop",
      memberNodeIds: members,
      childFrameIds,
      depth,
    } satisfies ReactFlowFrameData,
  }
}

function step(id: string, x: number, y: number): ReactFlowNode {
  return {
    id,
    type: "ecp-step",
    position: { x, y },
    style: { width: 260 },
    data: { label: id, uses: "test", inputs: [], outputs: [] },
  }
}

describe("positionStorageKey", () => {
  it("builds path and id keys", () => {
    expect(positionStorageKey({ kind: "path", path: "/tmp/a.ecp.json" })).toBe(
      "ecp.app.positions.v1:path:/tmp/a.ecp.json",
    )
    expect(positionStorageKey({ kind: "id", id: "exec_1" })).toBe("ecp.app.positions.v1:id:exec_1")
  })
})

describe("parsePositionOverrides", () => {
  it("keeps valid points", () => {
    expect(parsePositionOverrides(JSON.stringify({ a: { x: 1, y: 2 } }))).toEqual({ a: { x: 1, y: 2 } })
  })

  it("returns empty for malformed payloads", () => {
    for (const raw of [null, "", "{", "[]", "null", '{"a":{"x":1}}', '{"a":{"x":1,"y":"2"}}']) {
      expect(parsePositionOverrides(raw)).toEqual({})
    }
  })
})

describe("placeWithOverrides", () => {
  it("moves overridden nodes and rebuilds the frame", () => {
    const document: ReactFlowDocument = {
      nodes: [
        step("a", 0, 0),
        step("b", 400, 0),
        frameNode("ecp:frame:loop", ["a", "b"], [], 0),
      ],
      edges: [],
    }
    const placed = placeWithOverrides(document, { a: { x: 100, y: 50 } })
    const a = placed.nodes.find((node) => node.id === "a")!
    const b = placed.nodes.find((node) => node.id === "b")!
    expect(a.position).toEqual({ x: 100, y: 50 })
    expect(b.position).toEqual({ x: 400, y: 0 })
    const frame = placed.nodes.find((node) => node.type === "ecp-frame")!
    expect(frame.position.x).toBeLessThanOrEqual(100)
  })

  it("ignores overrides for unknown ids", () => {
    const document: ReactFlowDocument = { nodes: [step("a", 0, 0)], edges: [] }
    const placed = placeWithOverrides(document, { missing: { x: 9, y: 9 } })
    expect(placed.nodes[0]!.position).toEqual({ x: 0, y: 0 })
  })
})

describe("prunePositionOverrides", () => {
  it("drops removed and frame ids, keeps pending inserts", () => {
    const previous = new Set(["a", "b"])
    const next = new Set(["a"])
    const frames = new Set(["ecp:frame:b"])
    const overrides = { a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, pending: { x: 2, y: 2 }, "ecp:frame:b": { x: 3, y: 3 } }
    expect(prunePositionOverrides(overrides, previous, next, frames)).toEqual({
      a: { x: 0, y: 0 },
      pending: { x: 2, y: 2 },
    })
  })
})