import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { executionToReactFlow, tunnelRects } from "../../src/graph/index.js"
import { describe, expect, it } from "vitest"
import {
  parsePositionOverrides,
  placeWithOverrides,
  positionStorageKey,
  prunePositionOverrides,
} from "../../src/graph/positions.js"
import type { ReactFlowDocument, ReactFlowNode, ReactFlowTunnelData } from "../../src/graph/types.js"

function tunnelNode(id: string, members: string[], depth: number): ReactFlowNode {
  return {
    id,
    type: "ecp-tunnel",
    position: { x: 0, y: 0 },
    style: { width: 400, height: 300, pointerEvents: "none" },
    data: {
      structureId: "loop",
      tunnelKind: "loop",
      label: "loop",
      controlNodeId: "loop",
      endNodeId: "end:loop",
      sideNodeIds: members.filter((m) => m !== "loop" && m !== "end:loop"),
      memberNodeIds: members,
      childTunnelIds: [],
      depth,
    } satisfies ReactFlowTunnelData,
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
  it("moves overridden nodes and rebuilds the tunnel", () => {
    const document: ReactFlowDocument = {
      nodes: [
        { id: "loop", type: "ecp-loop", position: { x: -50, y: 0 }, style: { width: 260 }, data: { label: "loop", inputs: [], outputs: [] } },
        { id: "end:loop", type: "ecp-end", position: { x: 900, y: 0 }, data: { label: "end" } },
        step("a", 0, 0),
        step("b", 400, 0),
        tunnelNode("ecp:tunnel:loop:loop", ["loop", "a", "b", "end:loop"], 0),
      ],
      edges: [],
    }
    const placed = placeWithOverrides(document, { a: { x: 100, y: 50 } })
    const a = placed.nodes.find((node) => node.id === "a")!
    expect(a.position).toEqual({ x: 100, y: 50 })
    const tunnel = placed.nodes.find((node) => node.type === "ecp-tunnel")!
    expect(tunnel.position.x).toBeLessThanOrEqual(100)
    expect(tunnel.position.x + Number(tunnel.style?.width)).toBeGreaterThanOrEqual(400 + 260)
  })

  it("ignores overrides for unknown ids", () => {
    const document: ReactFlowDocument = { nodes: [step("a", 0, 0)], edges: [] }
    const placed = placeWithOverrides(document, { missing: { x: 9, y: 9 } })
    expect(placed.nodes[0]!.position).toEqual({ x: 0, y: 0 })
  })
})

describe("prunePositionOverrides", () => {
  it("drops removed and tunnel ids, keeps pending inserts", () => {
    const previous = new Set(["a", "b"])
    const next = new Set(["a"])
    const tunnels = new Set(["ecp:tunnel:b:loop"])
    const overrides = {
      a: { x: 0, y: 0 },
      b: { x: 1, y: 1 },
      pending: { x: 2, y: 2 },
      "ecp:tunnel:b:loop": { x: 3, y: 3 },
    }
    expect(prunePositionOverrides(overrides, previous, next, tunnels)).toEqual({
      a: { x: 0, y: 0 },
      pending: { x: 2, y: 2 },
    })
  })
})

describe("placeWithOverrides grows tunnels when body nodes move", () => {
  const manifest = JSON.parse(
    readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns/loop-for.ecp.json"), "utf8"),
  ) as ExecutionManifest

  it("rebuilds loop tunnel bounds after a body drag", () => {
    const encoded = executionToReactFlow(manifest)
    const loopId = manifest.steps.find((step) => step.type === "loop")?.id ?? "retry"
    const bodyId = (manifest.steps[0] as { type: string; steps?: Array<{ id: string }> }).steps?.[0]?.id ?? "attempt"
    const end = encoded.nodes.find((node) => node.id === `end:${loopId}`)!
    const placed = placeWithOverrides(encoded, { [bodyId]: { x: end.position.x + 600, y: end.position.y } })
    const tunnel = placed.nodes.find((node) => node.id === `ecp:tunnel:${loopId}:loop`)!
    const body = placed.nodes.find((node) => node.id === bodyId)!
    expect(body.position.x + 260).toBeLessThanOrEqual(tunnel.position.x + Number(tunnel.style?.width))
    const rects = tunnelRects(placed.nodes)
    expect(rects.get(`ecp:tunnel:${loopId}:loop`)?.width).toBeGreaterThan(Number(tunnel.style?.width) - 400)
  })
})