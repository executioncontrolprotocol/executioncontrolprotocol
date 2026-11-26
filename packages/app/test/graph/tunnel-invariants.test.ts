import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_NODE_WIDTH,
  executionToReactFlow,
  isNodeInsideTunnel,
  nodeBox,
  placeWithOverrides,
  rectContainsRect,
  rectsIntersect,
  tunnelRects,
} from "../../src/graph/index.js"
import type { FrameRect } from "../../src/graph/layout.js"
import { structureEndNodeId, type ReactFlowTunnelData } from "../../src/graph/types.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

function rectForStep(
  doc: ReturnType<typeof executionToReactFlow>,
  stepId: string,
): FrameRect {
  const node = doc.nodes.find((n) => n.id === stepId)!
  expect(node).toBeDefined()
  return nodeBox(node)
}

function tunnelRect(doc: ReturnType<typeof executionToReactFlow>, tunnelId: string): FrameRect {
  const rects = tunnelRects(doc.nodes)
  const rect = rects.get(tunnelId)
  expect(rect, tunnelId).toBeDefined()
  return rect!
}

describe("tunnel invariants", () => {
  it("if-in-loop: sibling tubes disjoint; picks in correct tubes; ends positioned on the merge rank", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const thenR = tunnelRect(doc, "ecp:tunnel:express:then")
    const elseR = tunnelRect(doc, "ecp:tunnel:express:else")
    const loopR = tunnelRect(doc, "ecp:tunnel:each-order:loop")
    expect(rectsIntersect(thenR, elseR)).toBe(false)
    expect(rectContainsRect(loopR, thenR)).toBe(true)
    expect(rectContainsRect(loopR, elseR)).toBe(true)

    const fast = doc.nodes.find((n) => n.id === "pick-fast")!
    const standard = doc.nodes.find((n) => n.id === "pick-standard")!
    expect(isNodeInsideTunnel(fast, thenR)).toBe(true)
    expect(isNodeInsideTunnel(fast, elseR)).toBe(false)
    expect(isNodeInsideTunnel(standard, elseR)).toBe(true)
    expect(isNodeInsideTunnel(standard, thenR)).toBe(false)

    const endIf = doc.nodes.find((n) => n.id === structureEndNodeId("express"))!
    const ship = rectForStep(doc, "ship")
    const fastBox = nodeBox(fast)
    const stdBox = nodeBox(standard)
    const endBox = nodeBox(endIf)
    expect(endBox.x).toBeGreaterThan(fastBox.x + fastBox.width)
    expect(endBox.x).toBeGreaterThan(stdBox.x + stdBox.width)
    expect(endBox.x).toBeLessThan(ship.x)
    const control = doc.nodes.find((n) => n.id === "express")!
    const endCy = endBox.y + endBox.height / 2
    const controlBox = nodeBox(control)
    expect(Math.abs(endCy - (controlBox.y + controlBox.height / 2))).toBeLessThan(2)

    const endLoop = doc.nodes.find((n) => n.id === structureEndNodeId("each-order"))!
    const notify = rectForStep(doc, "notify")
    const endLoopBox = nodeBox(endLoop)
    expect(endLoopBox.x).toBeGreaterThan(ship.x + ship.width)
    expect(endLoopBox.x).toBeLessThan(notify.x)
  })

  it("branch: outer tubes disjoint; inner if tubes inside else; gold offer near tier if", () => {
    const doc = executionToReactFlow(loadPattern("branch.ecp.json"))
    const outerThen = tunnelRect(doc, "ecp:tunnel:by-tier:then")
    const outerElse = tunnelRect(doc, "ecp:tunnel:by-tier:else")
    expect(rectsIntersect(outerThen, outerElse)).toBe(false)

    const innerThen = tunnelRect(doc, "ecp:tunnel:by-tier-silver:then")
    const innerElse = tunnelRect(doc, "ecp:tunnel:by-tier-silver:else")
    expect(rectsIntersect(innerThen, innerElse)).toBe(false)
    expect(rectContainsRect(outerElse, innerThen)).toBe(true)
    expect(rectContainsRect(outerElse, innerElse)).toBe(true)

    const tier = doc.nodes.find((n) => n.id === "by-tier")!
    const gold = doc.nodes.find((n) => n.id === "gold-offer")!
    const tierBox = nodeBox(tier)
    const goldBox = nodeBox(gold)
    expect(goldBox.x - (tierBox.x + tierBox.width)).toBeLessThanOrEqual(DEFAULT_NODE_WIDTH * 1.5)
  })

  it("nested-parallel: path tubes disjoint; nested tunnels inside parent path", () => {
    const doc = executionToReactFlow(loadPattern("nested-parallel.ecp.json"))
    const workPaths = doc.nodes.filter(
      (n) => n.type === "ecp-tunnel" && n.id.startsWith("ecp:tunnel:work:path-"),
    )
    expect(workPaths.length).toBe(2)
    const pathRects = workPaths.map((p) => tunnelRect(doc, p.id))
    expect(rectsIntersect(pathRects[0]!, pathRects[1]!)).toBe(false)

    const tunnels = doc.nodes.filter((n) => n.type === "ecp-tunnel")
    for (const tunnel of tunnels) {
      const data = tunnel.data as ReactFlowTunnelData
      for (const childId of data.childTunnelIds) {
        expect(rectContainsRect(tunnelRect(doc, tunnel.id), tunnelRect(doc, childId))).toBe(true)
      }
    }
  })

  it("dragging a body step keeps its loop tube wrapping the node", () => {
    const manifest = loadPattern("loop-for.ecp.json")
    const doc = executionToReactFlow(manifest)
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")!
    const bodyId =
      (manifest.steps[0] as { type: string; steps?: Array<{ id: string }> }).steps?.[0]?.id ?? "attempt"
    const placed = placeWithOverrides(doc, {
      [bodyId]: {
        x: doc.nodes.find((n) => n.id === bodyId)!.position.x + 120,
        y: doc.nodes.find((n) => n.id === bodyId)!.position.y + 80,
      },
    })
    const body = placed.nodes.find((n) => n.id === bodyId)!
    const loopTunnel = tunnelRect(placed, `ecp:tunnel:${loop.id}:loop`)
    expect(isNodeInsideTunnel(body, loopTunnel)).toBe(true)
  })
})