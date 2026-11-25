import { describe, expect, it } from "vitest"
import { boundsAroundNodeIds, layoutReactFlowDocument } from "../../src/graph/layout.js"
import type { ReactFlowDocument, ReactFlowNode } from "../../src/graph/types.js"

function node(id: string, x: number, y: number, extra: Partial<ReactFlowNode> = {}): ReactFlowNode {
  return {
    id,
    type: "ecp-step",
    position: { x, y },
    data: { inputs: [], outputs: [] } as unknown as ReactFlowNode["data"],
    ...extra,
  }
}

describe("boundsAroundNodeIds", () => {
  it("returns undefined when none of the ids are laid out", () => {
    expect(boundsAroundNodeIds([node("a", 0, 0)], ["missing"], 100, 50)).toBeUndefined()
  })

  it("spans every listed node, using a node's own width when it has one", () => {
    const nodes = [node("a", 10, 20), node("b", 300, 40, { style: { width: 120 } }), node("c", 999, 999)]
    expect(boundsAroundNodeIds(nodes, ["a", "b", "gone"], 100, 50)).toEqual({ x: 10, y: 20, width: 410, height: 128 })
  })
})

describe("layoutReactFlowDocument", () => {
  it("lays out nodes left to right, ignoring loop-back routes and edges to unknown nodes", () => {
    const doc = {
      nodes: [node("a", 0, 0), node("b", 0, 0)],
      edges: [
        { id: "ab", source: "a", target: "b", data: { kind: "route" } },
        { id: "ba", source: "b", target: "a", data: { kind: "route", loopBack: true } },
        { id: "ax", source: "a", target: "x", data: { kind: "route" } },
      ],
    } as unknown as ReactFlowDocument
    const laid = layoutReactFlowDocument(doc)
    const [a, b] = laid.nodes
    expect(a!.position.x).toBeLessThan(b!.position.x)
    expect(a!.style?.width).toBe(260)
    expect(laid.edges).toHaveLength(3)
  })

  it("honours direction and node size options", () => {
    const doc = {
      nodes: [node("a", 0, 0), node("b", 0, 0)],
      edges: [{ id: "ab", source: "a", target: "b", data: { kind: "route" } }],
    } as unknown as ReactFlowDocument
    const laid = layoutReactFlowDocument(doc, { direction: "TB", nodeWidth: 200, nodeHeight: 80 } as never)
    expect(laid.nodes[0]!.position.y).toBeLessThan(laid.nodes[1]!.position.y)
    expect(laid.nodes[0]!.style?.width).toBe(200)
  })
})
