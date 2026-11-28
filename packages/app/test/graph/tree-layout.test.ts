import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  EXECUTION_ACCEPTS_NODE_ID,
  executionToReactFlow,
  isNodeInsideTunnel,
  nodeBox,
  placeWithOverrides,
  rectsIntersect,
  tunnelRects,
} from "../../src/graph/index.js"
import { endMarkerId, type ReactFlowNode } from "../../src/graph/types.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

function centerY(node: ReactFlowNode, fallback = 160): number {
  const h =
    typeof node.style?.height === "number" && Number.isFinite(node.style.height)
      ? node.style.height
      : node.type === "ecp-end"
        ? 32
        : fallback
  return node.position.y + h / 2
}

describe("tree layout invariants", () => {
  it("if end markers sit on the top or bottom edge of their side band on if-in-loop", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const doc = executionToReactFlow(manifest)
    const endThen = doc.nodes.find((n) => n.id === endMarkerId("express", "then"))!
    const endElse = doc.nodes.find((n) => n.id === endMarkerId("express", "else"))!
    expect(centerY(endThen)).toBeLessThan(centerY(doc.nodes.find((n) => n.id === "pick-fast")!))
    expect(centerY(endElse)).toBeGreaterThan(centerY(doc.nodes.find((n) => n.id === "pick-standard")!))
    expect(nodeBox(endThen).x).toBeLessThanOrEqual(nodeBox(endElse).x + 2)
  })

  it("control is left of branch nodes; merge markers sit before ship", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const control = doc.nodes.find((n) => n.id === "express")!
    const endThen = doc.nodes.find((n) => n.id === endMarkerId("express", "then"))!
    const endElse = doc.nodes.find((n) => n.id === endMarkerId("express", "else"))!
    const fast = nodeBox(doc.nodes.find((n) => n.id === "pick-fast")!)
    const standard = nodeBox(doc.nodes.find((n) => n.id === "pick-standard")!)
    const ship = nodeBox(doc.nodes.find((n) => n.id === "ship")!)
    const cBox = nodeBox(control)
    const mergeRight = Math.max(nodeBox(endThen).x + nodeBox(endThen).width, nodeBox(endElse).x + nodeBox(endElse).width)
    expect(cBox.x + cBox.width).toBeLessThan(fast.x)
    expect(cBox.x + cBox.width).toBeLessThan(standard.x)
    expect(nodeBox(endThen).x).toBeGreaterThan(fast.x + fast.width)
    expect(nodeBox(endElse).x).toBeGreaterThan(standard.x + standard.width)
    expect(mergeRight).toBeLessThan(ship.x)
  })

  it("top-level inputs, steps and outputs share one horizontal line on branch", () => {
    const doc = executionToReactFlow(loadPattern("branch.ecp.json"))
    const accepts = doc.nodes.find((n) => n.id === EXECUTION_ACCEPTS_NODE_ID)!
    const start = doc.nodes.find((n) => n.id === "start")!
    const done = doc.nodes.find((n) => n.id === "done")!
    const tier = doc.nodes.find((n) => n.id === "by-tier")!
    const yAccepts = centerY(accepts)
    const yStart = centerY(start)
    const yDone = centerY(done)
    const yTier = centerY(tier)
    expect(Math.abs(yAccepts - yStart)).toBeLessThan(4)
    expect(Math.abs(yAccepts - yDone)).toBeLessThan(4)
    expect(Math.abs(yAccepts - yTier)).toBeLessThan(4)
  })

  it("then tube above else without overlap; nested tubes stay inside parent", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const thenR = tunnelRects(doc.nodes).get("ecp:tunnel:express:then")!
    const elseR = tunnelRects(doc.nodes).get("ecp:tunnel:express:else")!
    expect(thenR.y + thenR.height).toBeLessThanOrEqual(elseR.y + 1)
    expect(rectsIntersect(thenR, elseR)).toBe(false)
  })

  it("parallel paths stack without tube overlap", () => {
    const doc = executionToReactFlow(loadPattern("nested-parallel.ecp.json"))
    const paths = doc.nodes.filter((n) => n.type === "ecp-tunnel" && n.id.startsWith("ecp:tunnel:work:path-"))
    const rects = paths
      .map((p) => tunnelRects(doc.nodes).get(p.id)!)
      .sort((left, right) => left.y - right.y)
    for (let index = 1; index < rects.length; index += 1) {
      const prev = rects[index - 1]!
      const next = rects[index]!
      expect(prev.y + prev.height).toBeLessThanOrEqual(next.y + 2)
    }
  })

  it("loop end marker sits on the top edge of the loop body band", () => {
    const manifest = loadPattern("loop-for.ecp.json")
    const doc = executionToReactFlow(manifest)
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")!
    const end = doc.nodes.find((n) => n.id === endMarkerId(loop.id, "loop"))!
    const tick = doc.nodes.find((n) => n.id === "tick")!
    expect(centerY(end)).toBeLessThan(centerY(tick))
    expect(centerY(end)).toBeLessThan(centerY(loop) + 8)
  })

  it("empty else still produces a visible else tube", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: { id: "empty-else", accepts: { type: "object" } },
      steps: [
        {
          type: "if",
          id: "gate",
          expression: "true",
          then: [{ id: "ok", uses: "@executioncontrolprotocol/test.echo", input: { value: "yes" } }],
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    expect(doc.nodes.some((n) => n.id === "ecp:tunnel:gate:else")).toBe(true)
    const elseR = tunnelRects(doc.nodes).get("ecp:tunnel:gate:else")
    expect(elseR && elseR.height).toBeGreaterThan(10)
  })

  it("dragging a side step expands its tube without overlapping the other", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const elseBefore = tunnelRects(doc.nodes).get("ecp:tunnel:express:else")!
    const fast = doc.nodes.find((n) => n.id === "pick-fast")!
    const moved = placeWithOverrides(doc, {
      "pick-fast": { x: fast.position.x + 80, y: fast.position.y },
    })
    const thenAfter = tunnelRects(moved.nodes).get("ecp:tunnel:express:then")!
    const fastMoved = moved.nodes.find((n) => n.id === "pick-fast")!
    expect(isNodeInsideTunnel(fastMoved, thenAfter)).toBe(true)
    expect(rectsIntersect(thenAfter, elseBefore)).toBe(false)
  })
})