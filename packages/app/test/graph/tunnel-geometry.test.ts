import { describe, expect, it } from "vitest"
import { isNodeInsideTunnel, resizeTunnelNodes, tunnelBounds, tunnelRects } from "../../src/graph/tunnel-geometry.js"
import type { ReactFlowNode, ReactFlowTunnelData } from "../../src/graph/types.js"

function step(id: string, x: number, y: number): ReactFlowNode {
  return {
    id,
    type: "ecp-step",
    position: { x, y },
    style: { width: 260 },
    data: { label: id, uses: "test", inputs: [], outputs: [] },
  }
}

function tunnel(id: string, members: string[], depth: number): ReactFlowNode {
  return {
    id,
    type: "ecp-tunnel",
    position: { x: 0, y: 0 },
    zIndex: depth,
    data: {
      structureId: "s",
      tunnelKind: "loop",
      label: "forEach",
      controlNodeId: "s",
      endNodeId: "end:s:loop",
      sideNodeIds: members,
      memberNodeIds: members,
      childTunnelIds: [],
      depth,
    } satisfies ReactFlowTunnelData,
  }
}

describe("tunnel-geometry", () => {
  it("tunnelBounds adds padding around members", () => {
    const nodes = [step("a", 100, 50), step("b", 400, 50)]
    const rect = tunnelBounds(nodes, ["a", "b"])
    expect(rect).toBeDefined()
    expect(rect!.x).toBeLessThan(100)
    expect(rect!.width).toBeGreaterThan(400 + 260 - 100)
  })

  it("resizeTunnelNodes updates tunnel size and position", () => {
    const nodes = [
      { id: "s", type: "ecp-loop", position: { x: -80, y: 0 }, style: { width: 260 }, data: { label: "s", inputs: [], outputs: [] } },
      { id: "end:s:loop", type: "ecp-end", position: { x: 700, y: 0 }, data: { label: "end loop", structureId: "s", structureKind: "loop", side: "loop" } },
      step("a", 0, 0),
      step("b", 300, 0),
      tunnel("ecp:tunnel:s:loop", ["a", "b"], 0),
    ]
    const sized = resizeTunnelNodes(nodes)
    const t = sized.find((n) => n.type === "ecp-tunnel")!
    expect(Number(t.style?.width)).toBeGreaterThan(300)
    expect(t.position.x).toBeLessThanOrEqual(0)
  })

  it("tunnelRects returns a map of tunnel boxes", () => {
    const nodes = [
      { id: "x", type: "ecp-if" as const, position: { x: 0, y: 10 }, style: { width: 260 }, data: { label: "x", inputs: [], outputs: [] } },
      { id: "end:x:then", type: "ecp-end" as const, position: { x: 400, y: 10 }, data: { structureId: "x", structureKind: "if" as const, side: "then" as const, label: "end then" } },
      step("a", 80, 10),
      {
        ...tunnel("ecp:tunnel:x:then", ["a"], 0),
        data: {
          ...(tunnel("ecp:tunnel:x:then", ["a"], 0).data as ReactFlowTunnelData),
          tunnelKind: "then",
          controlNodeId: "x",
          endNodeId: "end:x:then",
        },
      },
    ]
    const rects = tunnelRects(nodes)
    expect(rects.has("ecp:tunnel:x:then")).toBe(true)
  })

  it("isNodeInsideTunnel checks center against the tunnel rect", () => {
    const nodes = resizeTunnelNodes([
      { id: "s", type: "ecp-loop", position: { x: 0, y: 50 }, style: { width: 260 }, data: { label: "s", inputs: [], outputs: [] } },
      { id: "end:s:loop", type: "ecp-end", position: { x: 500, y: 50 }, data: { structureId: "s", structureKind: "loop", side: "loop", label: "end loop" } },
      step("a", 50, 50),
      tunnel("ecp:tunnel:s:loop", ["a"], 0),
    ])
    const rect = tunnelRects(nodes).get("ecp:tunnel:s:loop")!
    const inner = nodes.find((n) => n.id === "a")!
    expect(isNodeInsideTunnel(inner, rect)).toBe(true)
    const outside = { ...inner, position: { x: 5000, y: 5000 } }
    expect(isNodeInsideTunnel(outside, rect)).toBe(false)
  })

  it("tunnelBounds returns undefined when members are missing", () => {
    expect(tunnelBounds([step("a", 0, 0)], ["missing"])).toBeUndefined()
  })
})