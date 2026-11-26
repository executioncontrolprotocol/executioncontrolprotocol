import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { containerRects, DEFAULT_NODE_WIDTH, executionToReactFlow } from "../../src/graph/index.js"
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
      startNodeId: members[0] ?? "loop-head",
      endNodeId: members[members.length - 1],
      bands: [{ bandId: `${id}:body`, label: "body", memberNodeIds: members.slice(1, -1) }],
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
    // a is the start node and b the end node: the edges follow their centres.
    expect(frame.position.x).toBe(100 + 130)
    expect(frame.position.x + Number(frame.style?.width)).toBe(400 + 130)
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
describe("placeWithOverrides keeps start and end nodes on the container's edges", () => {
  const manifest = JSON.parse(
    readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns/loop-for.ecp.json"), "utf8"),
  ) as ExecutionManifest

  function edges(document: ReturnType<typeof executionToReactFlow>) {
    const loopId = manifest.steps.find((step) => step.type === "loop")?.id ?? "retry"
    const frame = document.nodes.find((node) => node.id === `ecp:frame:${loopId}`)!
    const start = document.nodes.find((node) => node.id === loopId)!
    const end = document.nodes.find((node) => node.id === `end:${loopId}`)!
    const width = Number(frame.style?.width)
    return {
      left: frame.position.x,
      right: frame.position.x + width,
      startCentre: start.position.x + DEFAULT_NODE_WIDTH / 2,
      endCentre: end.position.x + DEFAULT_NODE_WIDTH / 2,
    }
  }

  it("as encoded", () => {
    const at = edges(executionToReactFlow(manifest))
    expect(at.startCentre).toBe(at.left)
    expect(at.endCentre).toBe(at.right)
  })

  it("after the start node and a body node are dragged", () => {
    const loopId = manifest.steps.find((step) => step.type === "loop")?.id ?? "rounds"
    const encoded = executionToReactFlow(manifest)
    const start = encoded.nodes.find((node) => node.id === loopId)!
    const bodyId = (manifest.steps[0] as { type: string; steps?: Array<{ id: string }> }).steps?.[0]?.id ?? "tick"
    const placed = placeWithOverrides(encoded, {
      [loopId]: { x: start.position.x - 100, y: start.position.y + 40 },
      [bodyId]: { x: 900, y: 400 },
    })
    const at = edges(placed)
    expect(at.startCentre).toBe(at.left)
    expect(at.endCentre).toBe(at.right)
  })

  it("grows the container and moves the end node when a body node is dragged past it", () => {
    const encoded = executionToReactFlow(manifest)
    const loopId = manifest.steps.find((step) => step.type === "loop")?.id ?? "retry"
    const bodyId = (manifest.steps[0] as { type: string; steps?: Array<{ id: string }> }).steps?.[0]?.id ?? "attempt"
    const end = encoded.nodes.find((node) => node.id === `end:${loopId}`)!
    const placed = placeWithOverrides(encoded, { [bodyId]: { x: end.position.x + 600, y: end.position.y } })
    const at = edges(placed)
    const attempt = placed.nodes.find((node) => node.id === bodyId)!
    expect(attempt.position.x + DEFAULT_NODE_WIDTH).toBeLessThan(at.right)
    expect(at.endCentre).toBe(at.right)
    expect(at.right).toBeGreaterThan(end.position.x + DEFAULT_NODE_WIDTH / 2)
  })

  it("places one divider between the then and else bands of an if", () => {
    const branch = JSON.parse(
      readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns/branch.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const placed = executionToReactFlow(branch)
    const frame = placed.nodes.find((node) => node.id === "ecp:frame:by-tier")!
    const data = frame.data as unknown as ReactFlowFrameData
    expect(data.bandDividerYs).toHaveLength(1)
    const gold = placed.nodes.find((node) => node.id === "gold-offer")!
    const silver = placed.nodes.find((node) => node.id === "by-tier-silver")!
    const divider = frame.position.y + data.bandDividerYs![0]!
    expect(divider).toBeGreaterThan(gold.position.y)
    expect(divider).toBeLessThan(silver.position.y)
  })

  it("leaves a container without a loop end with only its left edge pinned", () => {
    const branch = JSON.parse(
      readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns/branch.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const placed = placeWithOverrides(executionToReactFlow(branch), {})
    const frame = placed.nodes.find((node) => node.id === "ecp:frame:by-tier")!
    const head = placed.nodes.find((node) => node.id === "by-tier")!
    expect(head.position.x + DEFAULT_NODE_WIDTH / 2).toBe(frame.position.x)
    const rects = containerRects(placed.nodes)
    expect(rects.get("ecp:frame:by-tier")?.x).toBe(frame.position.x)
  })
})
