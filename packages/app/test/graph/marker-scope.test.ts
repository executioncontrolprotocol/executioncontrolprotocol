import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  EXECUTION_RETURNS_NODE_ID,
  MARKER_SCOPE_UNCHANGED,
  REPARENT_UNCHANGED,
  applyMarkerSnap,
  computeRailVisualLayer,
  executionToReactFlow,
  endMarkerId,
  markerSnapHighlight,
  reparentDropTarget,
  reparentNodeAtPoint,
  snapMarkerX,
} from "../../src/graph/index.js"
import { boundsAroundNodeIds, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../../src/graph/layout.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const patternsDir = path.resolve(here, "../../../../examples/patterns")
const ifInLoopPath = path.join(patternsDir, "if-in-loop.ecp.json")
const branchLoopPath = path.resolve(patternsDir, "../branch-loop/branch-loop.ecp.json")
const echo = "@executioncontrolprotocol/test.echo"

function loadIfInLoop(): ExecutionManifest {
  return JSON.parse(readFileSync(ifInLoopPath, "utf8")) as ExecutionManifest
}

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

function centerX(manifest: ExecutionManifest, nodeId: string): number {
  const doc = executionToReactFlow(manifest)
  const box = boundsAroundNodeIds(doc.nodes, [nodeId], DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
  expect(box).toBeDefined()
  return box!.x + box!.width / 2
}

describe("snapMarkerX", () => {
  it("counts nodes strictly left of the marker", () => {
    expect(snapMarkerX([{ id: "a", centerX: 100 }], [{ id: "b", centerX: 200 }], 150)).toBe(1)
    expect(snapMarkerX([{ id: "a", centerX: 100 }], [{ id: "b", centerX: 200 }], 250)).toBe(2)
    expect(snapMarkerX([{ id: "a", centerX: 100 }], [{ id: "b", centerX: 200 }], 50)).toBe(0)
  })

  it("returns zero when no nodes cross", () => {
    expect(snapMarkerX([], [], 400)).toBe(0)
    expect(snapMarkerX([], [{ id: "only", centerX: 900 }], 10)).toBe(0)
  })

  it("does not count a node whose centre equals the marker x", () => {
    expect(snapMarkerX([{ id: "a", centerX: 200 }], [], 200)).toBe(0)
    expect(snapMarkerX([{ id: "a", centerX: 200 }], [], 201)).toBe(1)
  })
})

describe("applyMarkerSnap", () => {
  it("pulls a parent sibling into else when end else crosses Ship", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "else")
    const shipCenter = centerX(manifest, "ship")
    const result = applyMarkerSnap(manifest, markerId, shipCenter + 30, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    const ifNode = loop.steps.find((node) => node.id === "express")
    expect(ifNode?.type).toBe("if")
    if (ifNode?.type !== "if") return
    expect(ifNode.else?.map((node) => node.id)).toEqual(["pick-standard", "ship"])
    expect(loop.steps.map((node) => node.id)).toEqual(["express"])
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["each-order", "notify"])
  })

  it("refuses when the marker does not cross a centre", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "else")
    const shipCenter = centerX(manifest, "ship")
    const unchanged = applyMarkerSnap(manifest, markerId, shipCenter - 5, document)
    expect(unchanged.ok).toBe(false)
    if (unchanged.ok) return
    expect(unchanged.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("refuses an invalid marker id", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = applyMarkerSnap(manifest, "pick-fast", 100, document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("refuses when the structure id on a valid marker is missing from the manifest", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const ghost = endMarkerId("no-such-structure", "then")
    const result = applyMarkerSnap(manifest, ghost, 500, document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("pulls a root sibling into loop steps from end loop", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("each-order", "loop")
    const notifyCenter = centerX(manifest, "notify")
    const result = applyMarkerSnap(manifest, markerId, notifyCenter + 40, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    expect(loop.steps.map((node) => node.id)).toEqual(["express", "ship", "notify"])
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["each-order"])
  })

  it("pulls both else steps when the marker crosses the first else centre", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "else")
    const pickCenter = centerX(manifest, "pick-standard")
    const result = applyMarkerSnap(manifest, markerId, pickCenter - 20, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    const express = loop.steps.find((node) => node.id === "express")
    expect(express?.type).toBe("if")
    if (express?.type !== "if") return
    expect(express.else).toEqual([])
    expect(loop.steps.map((node) => node.id)).toEqual(expect.arrayContaining(["pick-standard", "ship"]))
  })

  it("refuses moving end loop when the marker rests on its laid-out slot", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("each-order", "loop")
    const marker = document.nodes.find((node) => node.id === markerId)!
    const result = applyMarkerSnap(manifest, markerId, marker.position.x, document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("pushes tick onto the root list when end loop crosses it", () => {
    const manifest = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("retry", "loop")
    const tickCenter = centerX(manifest, "tick")
    const result = applyMarkerSnap(manifest, markerId, tickCenter - 20, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const retry = result.manifest.steps.find((node) => node.id === "retry")
    expect(retry?.type).toBe("loop")
    if (retry?.type !== "loop") return
    expect(retry.steps).toEqual([])
    expect(result.manifest.steps.map((node) => node.id)).toEqual(
      expect.arrayContaining(["Seed", "pick", "gated-gate", "retry", "tick"]),
    )
  })

  it("highlights tick when the loop end marker would absorb it", () => {
    const manifest = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("retry", "loop")
    const tickCenter = centerX(manifest, "tick")
    expect(markerSnapHighlight(manifest, markerId, tickCenter - 20, document)).toContain("tick")
  })

  it("refuses path markers on non-parallel controls", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = applyMarkerSnap(manifest, endMarkerId("express", "path-1"), 0, document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("refuses end then and end else on a loop control", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    for (const side of ["then", "else"] as const) {
      const result = applyMarkerSnap(manifest, endMarkerId("each-order", side), 0, document)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
    }
  })

  it("refuses an end then marker on a parallel control", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const work = manifest.steps[0]
    expect(work?.type).toBe("parallel")
    if (work?.type !== "parallel") return
    const markerId = endMarkerId("work", "then")
    const result = applyMarkerSnap(manifest, markerId, 0, document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(MARKER_SCOPE_UNCHANGED)
  })

  it("pushes the for loop out of the then branch when end then crosses it", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("depth", "then")
    const loopCenter = centerX(manifest, "passes-loop")
    const result = applyMarkerSnap(manifest, markerId, loopCenter - 30, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const depth = (result.manifest.steps[0] as { type: "parallel" }).paths[0]?.find((node) => node.id === "depth")
    expect(depth?.type).toBe("if")
    if (depth?.type !== "if") return
    expect(depth.then).toEqual([])
    expect((result.manifest.steps[0] as { type: "parallel" }).paths[0]?.map((node) => node.id)).toContain("passes-loop")
  })

  it("pushes a parallel else step onto the path list", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("depth", "else")
    const quickCenter = centerX(manifest, "quick-check")
    const result = applyMarkerSnap(manifest, markerId, quickCenter - 30, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parallel = manifest.steps[0]
    expect(parallel?.type).toBe("parallel")
    const depth = parallel?.type === "parallel" ? parallel.paths[0]?.find((node) => node.id === "depth") : undefined
    expect(depth?.type).toBe("if")
    if (depth?.type !== "if") return
    const updated = result.manifest.steps[0]
    expect(updated?.type).toBe("parallel")
    if (updated?.type !== "parallel") return
    const updatedDepth = updated.paths[0]?.find((node) => node.id === "depth")
    expect(updatedDepth?.type).toBe("if")
    if (updatedDepth?.type !== "if") return
    expect(updatedDepth.else).toEqual([])
    expect(updated.paths[0]?.map((node) => node.id)).toContain("quick-check")
  })

  it("empties then when the marker crosses left of every then step", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "then")
    const result = applyMarkerSnap(manifest, markerId, 0, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    const ifNode = loop.steps.find((node) => node.id === "express")
    expect(ifNode?.type).toBe("if")
    if (ifNode?.type !== "if") return
    expect(ifNode.then).toEqual([])
    expect(loop.steps.map((node) => node.id)).toContain("pick-fast")
  })

  it("pushes the last then node onto the parent list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "then")
    const pickCenter = centerX(manifest, "pick-fast")
    const result = applyMarkerSnap(manifest, markerId, pickCenter - 40, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    const ifNode = loop.steps.find((node) => node.id === "express")
    expect(ifNode?.type).toBe("if")
    if (ifNode?.type !== "if") return
    expect(ifNode.then).toEqual([])
    expect(loop.steps.map((node) => node.id)).toEqual(["express", "pick-fast", "ship"])
  })

  it("pulls a path sibling into parallel path 1 via end path-1", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const eachFile = manifest.steps[0]?.type === "parallel" ? manifest.steps[0].paths[1]?.[0] : undefined
    expect(eachFile?.type).toBe("loop")
    if (eachFile?.type !== "loop") return
    const parallel = eachFile.steps.find((node) => node.id === "file-checks")
    expect(parallel?.type).toBe("parallel")
    if (parallel?.type !== "parallel") return
    const markerId = endMarkerId("file-checks", "path-2")
    const fileOkCenter = centerX(manifest, "file-ok")
    const result = applyMarkerSnap(manifest, markerId, fileOkCenter + 30, document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = (result.manifest.steps[0] as { type: "parallel" }).paths[1]?.[0]
    expect(loop?.type).toBe("loop")
    if (loop?.type !== "loop") return
    const checks = loop.steps.find((node) => node.id === "file-checks")
    expect(checks?.type).toBe("parallel")
    if (checks?.type !== "parallel") return
    expect(checks.paths[0]?.map((node) => node.id)).toEqual(["lint"])
    expect(checks.paths[1]?.map((node) => node.id)).toEqual(["scan", "file-ok"])
  })
})

describe("markerSnapHighlight", () => {
  it("returns nothing for an unknown marker id", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const marker = document.nodes.find((node) => node.id === endMarkerId("express", "then"))!
    expect(markerSnapHighlight(manifest, endMarkerId("express", "then"), marker.position.x, document)).toEqual([])
    expect(markerSnapHighlight(manifest, "nope", 500, document)).toEqual([])
  })

  it("lists steps about to cross the marker boundary", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "else")
    const shipCenter = centerX(manifest, "ship")
    const ids = markerSnapHighlight(manifest, markerId, shipCenter + 30, document)
    expect(ids).toContain("ship")
  })

  it("lists a then step pushed onto the parent list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "then")
    const pickCenter = centerX(manifest, "pick-fast")
    const ids = markerSnapHighlight(manifest, markerId, pickCenter - 40, document)
    expect(ids).toContain("pick-fast")
  })

  it("returns nothing when the marker would not change scope", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const markerId = endMarkerId("express", "then")
    const pickCenter = centerX(manifest, "pick-fast")
    expect(markerSnapHighlight(manifest, markerId, pickCenter + 400, document)).toEqual([])
  })
})

describe("reparentDropTarget", () => {
  it("resolves every side band in nested parallel", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const bands = computeRailVisualLayer(manifest.steps, document.nodes).filter(
      (shape): shape is { kind: "path"; testId: string; box: { x: number; y: number; width: number; height: number } } =>
        shape.kind === "path" && shape.testId.startsWith("ecp-side-") && "box" in shape && shape.box !== undefined,
    )
    expect(bands.length).toBeGreaterThan(2)
    for (const band of bands) {
      const target = reparentDropTarget(manifest, document, {
        x: band.box.x + 8,
        y: band.box.y + 8,
      })
      expect(target?.testId).toBe(band.testId)
    }
  })

  it("reports a then side band under the pointer", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const thenBand = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-express-then",
    )
    expect(thenBand?.kind).toBe("path")
    if (thenBand?.kind !== "path" || !thenBand.box) return
    const target = reparentDropTarget(manifest, document, {
      x: thenBand.box.x + 10,
      y: thenBand.box.y + 10,
    })
    expect(target?.kind).toBe("band")
    expect(target?.testId).toBe("ecp-side-express-then")
  })

  it("returns undefined away from bands, tunnels, and rails", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    expect(reparentDropTarget(manifest, document, { x: -50_000, y: -50_000 })).toBeUndefined()
  })

  it("reports a loop tunnel under the pointer", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const tunnel = document.nodes.find((node) => node.id === "ecp:tunnel:each-order:loop")!
    const target = reparentDropTarget(manifest, document, {
      x: tunnel.position.x + 40,
      y: tunnel.position.y + 40,
    })
    expect(target?.kind).toBe("tunnel")
    expect(target?.testId).toBe(tunnel.id)
  })

  it("reports the root rail on a horizontal hit", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const rail = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-root",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const y = Number.parseFloat(match![2]!)
    const rightX = Number.parseFloat(match![3]!) - 12
    const target = reparentDropTarget(manifest, document, { x: rightX, y })
    expect(target).toEqual({ kind: "rail", testId: "ecp-rail-root" })
  })

  it("prefers a then band over the loop rail at the same coordinates", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const rail = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-loop-passes-loop",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const y = Number.parseFloat(match![2]!)
    const midX = (Number.parseFloat(match![1]!) + Number.parseFloat(match![3]!)) / 2
    const target = reparentDropTarget(manifest, document, { x: midX, y })
    expect(target).toEqual({ kind: "band", testId: "ecp-side-depth-then" })
  })
})

describe("reparentNodeAtPoint", () => {
  it("keeps the manifest when the drop stays in the same list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const ship = document.nodes.find((node) => node.id === "ship")!
    const result = reparentNodeAtPoint(manifest, document, "ship", ship.position)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("keeps the manifest when reordering within the same list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const tunnel = document.nodes.find((node) => node.id === "ecp:tunnel:each-order:loop")!
    const point = {
      x: tunnel.position.x + tunnel.style!.width! - 40,
      y: tunnel.position.y + tunnel.style!.height! / 2,
    }
    const result = reparentNodeAtPoint(manifest, document, "ship", point)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("refuses an unknown node id", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = reparentNodeAtPoint(manifest, document, "ghost-step", { x: 0, y: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("refuses a drop on empty canvas away from rails and bands", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = reparentNodeAtPoint(manifest, document, "ship", { x: -10_000, y: -10_000 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("refuses io boundary nodes", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = reparentNodeAtPoint(manifest, document, "execution-accepts", { x: 0, y: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
    const returns = reparentNodeAtPoint(manifest, document, EXECUTION_RETURNS_NODE_ID, { x: 0, y: 0 })
    expect(returns.ok).toBe(false)
    if (returns.ok) return
    expect(returns.reason).toBe(REPARENT_UNCHANGED)
  })

  it("reattaches a detached root into a loop body band", () => {
    const before = structuredClone(loadIfInLoop())
    before.detached = [
      {
        id: "late",
        uses: echo,
        input: { value: "late" },
        as: "late",
      },
    ]
    const document = executionToReactFlow(before)
    const tunnel = document.nodes.find((node) => node.id === "ecp:tunnel:each-order:loop")!
    expect(tunnel).toBeDefined()
    const point = {
      x: tunnel.position.x + 120,
      y: tunnel.position.y + tunnel.style!.height! / 2,
    }
    const result = reparentNodeAtPoint(before, document, "late", point)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached).toBeUndefined()
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    expect(loop.steps.map((node) => node.id)).toContain("late")
  })

  it("reattaches a detached root onto the root rail", () => {
    const before = structuredClone(loadIfInLoop())
    before.detached = [
      {
        id: "late",
        uses: echo,
        input: { value: "late" },
        as: "late",
      },
    ]
    const document = executionToReactFlow(before)
    const rail = computeRailVisualLayer(before.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-root",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const y = Number.parseFloat(match![2]!)
    const x = Number.parseFloat(match![3]!) - 20
    const result = reparentNodeAtPoint(before, document, "late", { x, y })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached).toBeUndefined()
    expect(result.manifest.steps.map((node) => node.id)).toContain("late")
  })

  it("places a nested loop step onto the root rail after its loop", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const rail = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-root",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const y = Number.parseFloat(match![2]!)
    const x = Number.parseFloat(match![3]!) - 40
    const result = reparentNodeAtPoint(manifest, document, "review-pass", { x, y })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parallel = result.manifest.steps[0]
    expect(parallel?.type).toBe("parallel")
    if (parallel?.type !== "parallel") return
    const depth = parallel.paths[0]?.find((node) => node.id === "depth")
    expect(depth?.type).toBe("if")
    if (depth?.type !== "if") return
    const loop = depth.then.find((node) => node.id === "passes-loop")
    expect(loop?.type).toBe("loop")
    if (loop?.type !== "loop") return
    expect(loop.steps.map((node) => node.id)).toEqual([])
    expect(depth.then.map((node) => node.id)).toContain("review-pass")
  })

  it("moves notify from the root rail into loop steps", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const tunnel = document.nodes.find((node) => node.id === "ecp:tunnel:each-order:loop")!
    const point = {
      x: tunnel.position.x + 80,
      y: tunnel.position.y + tunnel.style!.height! / 2,
    }
    const result = reparentNodeAtPoint(manifest, document, "notify", point)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["each-order"])
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    expect(loop.steps.map((node) => node.id)).toContain("notify")
    expect(result.manifest.steps.map((node) => node.id)).not.toContain("notify")
  })

  it("moves quick-check from a nested else onto the root rail", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const rail = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-root",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const point = {
      x: Number.parseFloat(match![1]!) + 220,
      y: Number.parseFloat(match![2]!),
    }
    const result = reparentNodeAtPoint(manifest, document, "quick-check", point)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const depth = (result.manifest.steps[0] as { type: "parallel" }).paths[0]?.find((node) => node.id === "depth")
    expect(depth?.type).toBe("if")
    if (depth?.type !== "if") return
    expect(depth.else).toEqual([])
    const work = result.manifest.steps[0]
    expect(work?.type).toBe("parallel")
    if (work?.type !== "parallel") return
    expect(work.paths[0]?.map((node) => node.id)).toContain("quick-check")
  })

  it("moves scan from a parallel path into the loop body via the loop rail", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const result = reparentNodeAtPoint(manifest, document, "scan", { x: 950, y: 352 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = (result.manifest.steps[0] as { type: "parallel" }).paths[1]?.[0]
    expect(loop?.type).toBe("loop")
    if (loop?.type !== "loop") return
    expect(loop.steps.map((node) => node.id)).toContain("scan")
    const checks = loop.steps.find((node) => node.id === "file-checks")
    expect(checks?.type).toBe("parallel")
    if (checks?.type !== "parallel") return
    expect(checks.paths[1]?.map((node) => node.id)).toEqual([])
  })

  it("moves pick-standard out of else onto the loop list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const thenBand = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-express-then",
    )
    expect(thenBand?.kind).toBe("path")
    if (thenBand?.kind !== "path" || !thenBand.box) return
    const result = reparentNodeAtPoint(manifest, document, "pick-standard", {
      x: thenBand.box.x + 20,
      y: thenBand.box.y + thenBand.box.height / 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps[0] as { type: "loop"; steps: Node[] }
    const express = loop.steps.find((node) => node.id === "express")
    expect(express?.type).toBe("if")
    if (express?.type !== "if") return
    expect(express.else).toEqual([])
    expect(loop.steps.map((node) => node.id)).toContain("pick-standard")
  })

  it("moves lint from path 1 into the path 2 band", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const document = executionToReactFlow(manifest)
    const path2 = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-file-checks-path-2",
    )
    expect(path2?.kind).toBe("path")
    if (path2?.kind !== "path" || !path2.box) return
    const result = reparentNodeAtPoint(manifest, document, "lint", {
      x: path2.box.x + 30,
      y: path2.box.y + path2.box.height / 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parallel = (result.manifest.steps[0] as { type: "parallel" }).paths[1]?.[0]
    expect(parallel?.type).toBe("loop")
    if (parallel?.type !== "loop") return
    const checks = parallel.steps.find((node) => node.id === "file-checks")
    expect(checks?.type).toBe("parallel")
    if (checks?.type !== "parallel") return
    expect(checks.paths[0]?.map((node) => node.id)).toEqual([])
    expect(checks.paths[1]?.map((node) => node.id)).toEqual(["lint", "scan"])
  })

  it("refuses dropping a control node into its own child list", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const thenBand = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-express-then",
    )
    expect(thenBand?.kind).toBe("path")
    if (thenBand?.kind !== "path" || !thenBand.box) return
    const result = reparentNodeAtPoint(manifest, document, "express", {
      x: thenBand.box.x + 10,
      y: thenBand.box.y + 10,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("refuses reattaching a nested detached root as a separate entry", () => {
    const before = structuredClone(loadIfInLoop())
    before.detached = [
      {
        type: "if",
        id: "outer",
        expression: "true",
        then: [{ id: "inner", uses: echo, input: { value: "x" }, as: "inner" }],
        else: [],
      },
      { id: "inner", uses: echo, input: { value: "dup" }, as: "dup" },
    ]
    const document = executionToReactFlow(before)
    const rail = computeRailVisualLayer(before.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-rail-root",
    )
    expect(rail?.kind).toBe("path")
    if (rail?.kind !== "path") return
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(rail.d)
    expect(match).toBeTruthy()
    const point = {
      x: (Number.parseFloat(match![1]!) + Number.parseFloat(match![3]!)) / 2,
      y: Number.parseFloat(match![2]!),
    }
    const result = reparentNodeAtPoint(before, document, "inner", point)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("moves expanded from then into the else band", () => {
    const manifest = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
    const document = executionToReactFlow(manifest)
    const elseBand = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-pick-else",
    )
    expect(elseBand?.kind).toBe("path")
    if (elseBand?.kind !== "path" || !elseBand.box) return
    const result = reparentNodeAtPoint(manifest, document, "expanded", {
      x: elseBand.box.x + 24,
      y: elseBand.box.y + elseBand.box.height / 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const pick = result.manifest.steps.find((node) => node.id === "pick")
    expect(pick?.type).toBe("if")
    if (pick?.type !== "if") return
    expect(pick.then.map((node) => node.id)).toEqual([])
    expect(pick.else?.map((node) => node.id)).toContain("expanded")
  })

  it("moves compact from else into the then band", () => {
    const manifest = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
    const document = executionToReactFlow(manifest)
    const thenBand = computeRailVisualLayer(manifest.steps, document.nodes).find(
      (shape) => shape.kind === "path" && shape.testId === "ecp-side-pick-then",
    )
    expect(thenBand?.kind).toBe("path")
    if (thenBand?.kind !== "path" || !thenBand.box) return
    const result = reparentNodeAtPoint(manifest, document, "compact", {
      x: thenBand.box.x + 24,
      y: thenBand.box.y + thenBand.box.height / 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updated = result.manifest.steps.find((node) => node.id === "pick")
    expect(updated?.type).toBe("if")
    if (updated?.type !== "if") return
    expect(updated.else?.map((node) => node.id)).toEqual([])
    expect(updated.then.map((node) => node.id)).toContain("compact")
  })

  it("keeps a sibling in detached when only one root reattaches", () => {
    const before = structuredClone(loadIfInLoop())
    before.detached = [
      {
        id: "late",
        uses: echo,
        input: { value: "late" },
        as: "late",
      },
      {
        id: "stay",
        uses: echo,
        input: { value: "stay" },
        as: "stay",
      },
    ]
    const document = executionToReactFlow(before)
    const tunnel = document.nodes.find((node) => node.id === "ecp:tunnel:each-order:loop")!
    const point = {
      x: tunnel.position.x + 120,
      y: tunnel.position.y + tunnel.style!.height! / 2,
    }
    const result = reparentNodeAtPoint(before, document, "late", point)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached?.map((node) => node.id)).toEqual(["stay"])
  })

  it("refuses reattaching when detached is missing from the manifest", () => {
    const manifest = loadIfInLoop()
    const document = executionToReactFlow(manifest)
    const result = reparentNodeAtPoint(manifest, document, "late", { x: 0, y: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })

  it("keeps loop step drags as position overrides only", () => {
    const manifest = JSON.parse(readFileSync(branchLoopPath, "utf8")) as ExecutionManifest
    const document = executionToReactFlow(manifest)
    const tick = document.nodes.find((node) => node.id === "tick")!
    const result = reparentNodeAtPoint(manifest, document, "tick", {
      x: tick.position.x + 90,
      y: tick.position.y,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(REPARENT_UNCHANGED)
  })
})