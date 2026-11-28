import { describe, expect, it } from "vitest"
import { boundsAroundNodeIds } from "../../src/graph/layout.js"
import { layoutManifestTree } from "../../src/graph/tree-layout.js"
import type { ReactFlowNode } from "../../src/graph/types.js"

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

describe("layoutManifestTree", () => {
  it("lays steps in one row left to right", () => {
    const roots = [
      { id: "a", uses: "@executioncontrolprotocol/test.echo", input: {} },
      { id: "b", uses: "@executioncontrolprotocol/test.echo", input: {} },
    ]
    const rf: ReactFlowNode[] = [
      node("a", 0, 0),
      node("b", 0, 0),
    ]
    const positions = layoutManifestTree(roots, rf)
    expect(positions.get("a")!.x).toBeLessThan(positions.get("b")!.x)
    expect(positions.get("a")!.y).toBe(positions.get("b")!.y)
  })
})