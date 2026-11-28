import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  BRANCH_ENTRY_CURVE,
  BRANCH_LANE_SPACING,
  composeBranchPath,
  computeBranchRoutes,
  executionToReactFlow,
  extractDataEdges,
  pathBoundingBox,
  pathEndPoint,
  pathMidpoint,
  pathStartPoint,
  pointInBox,
  railBandBoxes,
} from "../../src/graph/index.js"
import { inputHandleY, outputHandleY, sourceAttachX, targetAttachX } from "../../src/graph/rail-geometry.js"
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../../src/graph/layout.js"
import { nodeBox } from "../../src/graph/tunnel-geometry.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

function acceptKeys(manifest: ExecutionManifest): Set<string> {
  const props = (manifest.execution?.accepts as { properties?: Record<string, unknown> } | undefined)?.properties
  return new Set(props ? Object.keys(props) : [])
}

function routesFor(manifest: ExecutionManifest): Map<string, string> {
  const laid = executionToReactFlow(manifest)
  const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys(manifest))
  return computeBranchRoutes({
    roots: manifest.steps ?? [],
    laidNodes: laid.nodes,
    edges: dataEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "output",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "value",
    })),
    manifest,
  })
}

function edgeMiddle(
  manifest: ExecutionManifest,
  map: Map<string, string>,
  source: string,
  target: string,
): { middle: string; edgeId: string; sourceHandle: string; targetHandle: string } {
  const acceptKeys = new Set(
    manifest.execution?.accepts
      ? Object.keys((manifest.execution.accepts as { properties?: Record<string, unknown> }).properties ?? {})
      : [],
  )
  const match = extractDataEdges(manifest.steps ?? [], acceptKeys).find(
    (edge) => edge.source === source && edge.target === target,
  )
  if (!match) throw new Error(`no edge ${source} -> ${target}`)
  const middle = map.get(match.id)
  if (!middle) throw new Error(`no route for ${match.id}`)
  return {
    middle,
    edgeId: match.id,
    sourceHandle: match.sourceHandle ?? "output",
    targetHandle: match.targetHandle ?? "value",
  }
}

function composedEdgeRoute(
  manifest: ExecutionManifest,
  map: Map<string, string>,
  source: string,
  target: string,
): string {
  const { middle, sourceHandle, targetHandle } = edgeMiddle(manifest, map, source, target)
  const laid = executionToReactFlow(manifest).nodes
  const byId = new Map(laid.map((node) => [node.id, node]))
  const sourceNode = byId.get(source)
  const targetNode = byId.get(target)
  if (!sourceNode || !targetNode) throw new Error(`missing nodes ${source} or ${target}`)
  const sourceX = sourceAttachX(sourceNode, DEFAULT_NODE_WIDTH)
  const sourceY = outputHandleY(sourceNode, sourceHandle, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
  const targetX = targetAttachX(targetNode, DEFAULT_NODE_WIDTH)
  const targetY = inputHandleY(targetNode, targetHandle, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
  return composeBranchPath(sourceX, sourceY, targetX, targetY, middle)
}

function edgeRoute(
  manifest: ExecutionManifest,
  map: Map<string, string>,
  source: string,
  target: string,
): string {
  return composedEdgeRoute(manifest, map, source, target)
}

describe("computeBranchRoutes", () => {
  it("if-in-loop: Pick fast to Ship passes through the then band and join", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "pick-fast", "ship")
    const boxes = railBandBoxes(manifest.steps ?? [], executionToReactFlow(manifest).nodes)
    const thenBand = boxes.find((shape) => shape.testId === "ecp-side-express-then")?.box
    expect(thenBand).toBeDefined()
    const laid = executionToReactFlow(manifest).nodes
    const pick = nodeBox(laid.find((n) => n.id === "pick-fast")!, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    const sampleX = pick.x + pick.width + (thenBand!.x + thenBand!.width - pick.x - pick.width) / 2
    const sampleY = pick.y + pick.height / 3
    expect(pointInBox({ x: sampleX, y: sampleY }, thenBand!)).toBe(true)
    expect(d).toContain("L")
    const ship = laid.find((n) => n.id === "ship")!
    expect(d).toMatch(new RegExp(`${nodeBox(ship).x}`))
  })

  it("if-in-loop: Pick standard to Ship passes through else without crossing then", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const fast = edgeRoute(manifest, routes, "pick-fast", "ship")
    const standard = edgeRoute(manifest, routes, "pick-standard", "ship")
    const ys = (d: string) => (d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []).filter((_, index) => index % 2 === 1)
    const fastMid = ys(fast).slice(0, 4).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(4, ys(fast).length))
    const standardMid = ys(standard).slice(0, 4).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(4, ys(standard).length))
    expect(fastMid).toBeLessThan(standardMid)
  })

  it("if-in-loop: Ship to Notify stays low along the rail", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "ship", "notify")
    const bbox = pathBoundingBox(d)
    const midY = bbox.y + bbox.height / 2
    const laid = executionToReactFlow(manifest).nodes
    const ship = nodeBox(laid.find((n) => n.id === "ship")!, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    const notify = nodeBox(laid.find((n) => n.id === "notify")!, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    expect(bbox.x).toBeLessThanOrEqual(ship.x + ship.width + 2)
    expect(bbox.x + bbox.width).toBeGreaterThanOrEqual(notify.x - 2)
    expect(Math.abs(midY - (ship.y + ship.height / 2))).toBeLessThan(48)
  })

  it("if-in-loop: Express to Pick fast uses the then port neck", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "express", "pick-fast")
    expect(d.startsWith("M")).toBe(true)
    expect(d).toContain("C")
    const laid = executionToReactFlow(manifest).nodes
    const pick = nodeBox(laid.find((n) => n.id === "pick-fast")!, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    expect(d).toMatch(new RegExp(`${pick.x}`))
  })

  it("bundle: merge port branches are at least 5px apart entering Ship", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const fast = edgeRoute(manifest, routes, "pick-fast", "ship")
    const standard = edgeRoute(manifest, routes, "pick-standard", "ship")
    const laneY = (d: string): number => Number(d.match(/\sL\s+[\d.-]+\s+([\d.-]+)/)?.[1] ?? 0)
    expect(Math.abs(laneY(fast) - laneY(standard))).toBeGreaterThanOrEqual(BRANCH_LANE_SPACING - 1)
  })

  it("nested branch: Inputs tier reaches Silver tier? along the outer else band", () => {
    const manifest = loadPattern("branch.ecp.json")
    const routes = routesFor(manifest)
    const acceptKeys = new Set(["tier"])
    const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys)
    const edge = dataEdges.find((e) => e.source === "ecp:accepts" && e.target === "by-tier-silver")
    expect(edge).toBeDefined()
    const d = routes.get(edge!.id)
    expect(d).toBeDefined()
    const boxes = railBandBoxes(manifest.steps ?? [], executionToReactFlow(manifest).nodes)
    const elseBand = boxes.find((shape) => shape.testId === "ecp-side-by-tier-else")?.box
    expect(elseBand).toBeDefined()
    const nums = d!.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const ys = nums.filter((_, index) => index % 2 === 1)
    expect(ys.some((y) => y >= elseBand!.y && y <= elseBand!.y + elseBand!.height)).toBe(true)
  })

  it("helpers: pathMidpoint, pathBoundingBox and pointInBox", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "ship", "notify")
    expect(Number.isFinite(pathMidpoint(d).x)).toBe(true)
    expect(pathBoundingBox(d).width).toBeGreaterThan(0)
    expect(pointInBox({ x: 0, y: 0 }, { x: 0, y: 0, width: 1, height: 1 })).toBe(true)
    expect(pointInBox({ x: 5, y: 5 }, { x: 0, y: 0, width: 1, height: 1 })).toBe(false)
  })

  it("detached roots are not routed", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    manifest.detached = [
      {
        id: "loner",
        label: "Detached",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: 1 },
        as: "loner",
      },
    ]
    const laid = executionToReactFlow(manifest)
    const routes = computeBranchRoutes({
      roots: manifest.steps ?? [],
      laidNodes: laid.nodes,
      edges: [{ id: "e1", source: "loner", sourceHandle: "output", target: "notify", targetHandle: "value" }],
      manifest,
      detachedNodeIds: new Set(["loner"]),
    })
    expect(routes.size).toBe(0)
  })

  it("parallel pattern routes path branches", () => {
    const manifest = loadPattern("parallel.ecp.json")
    const routes = routesFor(manifest)
    expect(routes.size).toBeGreaterThan(2)
  })

  it("every pattern ships at least one routed branch", () => {
    const names = [
      "branch.ecp.json",
      "loop-for.ecp.json",
      "loop-foreach.ecp.json",
      "nested-foreach-branch.ecp.json",
      "nested-parallel.ecp.json",
    ]
    for (const name of names) {
      const manifest = loadPattern(name)
      const routes = routesFor(manifest)
      expect(routes.size, name).toBeGreaterThan(0)
    }
  })

  it("Express? then port to Pick fast stays inside the then band", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "express", "pick-fast")
    const boxes = railBandBoxes(manifest.steps ?? [], executionToReactFlow(manifest).nodes)
    const thenBand = boxes.find((shape) => shape.testId === "ecp-side-express-then")?.box
    expect(thenBand).toBeDefined()
    if (!thenBand) return
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const points = nums.filter((_, index) => index % 2 === 0).map((x, index) => ({
      x,
      y: nums[index * 2 + 1]!,
    }))
    expect(points.some((point) => pointInBox(point, thenBand))).toBe(true)
  })

  it("nested parallel path steps receive routed accepts branches", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const routes = routesFor(manifest)
    const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys(manifest))
    expect(dataEdges.length).toBeGreaterThan(0)
    expect(dataEdges.every((edge) => routes.has(edge.id))).toBe(true)
  })

  it("ignores edges with missing layout nodes or unknown tunnel handles", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest)
    const routes = computeBranchRoutes({
      roots: manifest.steps ?? [],
      laidNodes: laid.nodes,
      edges: [
        {
          id: "bogus",
          source: "pick-fast",
          sourceHandle: "output",
          target: "missing-node",
          targetHandle: "value",
        },
        {
          id: "tunnel",
          source: "express",
          sourceHandle: "unknown-handle",
          target: "pick-fast",
          targetHandle: "order",
        },
      ],
      manifest,
    })
    expect(routes.has("bogus")).toBe(false)
    expect(routes.has("tunnel")).toBe(true)
  })

  it("loop item routes along the loop body rail into a downstream step", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const d = edgeRoute(manifest, routes, "each-order", "express")
    expect(d).toMatch(/^M/)
    expect(pathBoundingBox(d).width).toBeGreaterThan(40)
  })

  it("nested-foreach-branch routes branches through nested controls", () => {
    const manifest = loadPattern("nested-foreach-branch.ecp.json")
    const routes = routesFor(manifest)
    expect(routes.size).toBeGreaterThan(3)
    const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys(manifest))
    for (const edge of dataEdges) {
      const d = routes.get(edge.id)
      if (d) expect(d.length).toBeGreaterThan(10)
    }
  })

  it("returns empty maps for empty graphs", () => {
    expect(computeBranchRoutes({ roots: [], laidNodes: [], edges: [] }).size).toBe(0)
    expect(railBandBoxes([], [])).toEqual([])
  })

  it("still routes other sides when one end marker is missing", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes.filter((node) => node.id !== "end:express:then")
    const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys(manifest))
    const routes = computeBranchRoutes({
      roots: manifest.steps ?? [],
      laidNodes: laid,
      edges: dataEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? "output",
        target: edge.target,
        targetHandle: edge.targetHandle ?? "value",
      })),
      manifest,
    })
    expect(routes.size).toBeGreaterThan(0)
    expect(edgeRoute(manifest, routes, "pick-standard", "ship")).toContain("L")
  })

  it("edge: adjacent rail nodes use a short segment", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const routes = routesFor(manifest)
    const acceptKeys = new Set(["orders"])
    const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys)
    const edge = dataEdges.find((e) => e.source === "ecp:accepts" && e.target === "each-order")
    expect(edge).toBeDefined()
    const d = composedEdgeRoute(manifest, routes, "ecp:accepts", "each-order")
    expect(d.split(" ").length).toBeLessThan(24)
  })

  it("compose: every pattern data edge anchors on layout port coordinates", () => {
    const patternNames = [
      "if-in-loop.ecp.json",
      "branch.ecp.json",
      "parallel.ecp.json",
      "loop-for.ecp.json",
      "loop-foreach.ecp.json",
      "nested-foreach-branch.ecp.json",
      "nested-parallel.ecp.json",
    ]
    for (const name of patternNames) {
      const manifest = loadPattern(name)
      const routes = routesFor(manifest)
      const keys = acceptKeys(manifest)
      const dataEdges = extractDataEdges(manifest.steps ?? [], keys)
      const laid = executionToReactFlow(manifest).nodes
      const byId = new Map(laid.map((node) => [node.id, node]))
      for (const edge of dataEdges) {
        const middle = routes.get(edge.id)
        if (!middle) continue
        const sourceNode = byId.get(edge.source)
        const targetNode = byId.get(edge.target)
        expect(sourceNode, `${name} ${edge.id} source`).toBeDefined()
        expect(targetNode, `${name} ${edge.id} target`).toBeDefined()
        const sourceX = sourceAttachX(sourceNode!, DEFAULT_NODE_WIDTH)
        const sourceY = outputHandleY(sourceNode!, edge.sourceHandle ?? "output", DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
        const targetX = targetAttachX(targetNode!, DEFAULT_NODE_WIDTH)
        const targetY = inputHandleY(targetNode!, edge.targetHandle ?? "value", DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
        const d = composeBranchPath(sourceX, sourceY, targetX, targetY, middle)
        const start = pathStartPoint(d)
        const end = pathEndPoint(d)
        expect(Math.hypot(start.x - sourceX, start.y - sourceY), `${name} ${edge.id} start`).toBeLessThan(0.01)
        expect(Math.hypot(end.x - targetX, end.y - targetY), `${name} ${edge.id} end`).toBeLessThan(0.01)
      }
    }
  })

  it("compose: branch Inputs reaches Silver tier with a middle route", () => {
    const manifest = loadPattern("branch.ecp.json")
    const routes = routesFor(manifest)
    expect(routes.has(edgeMiddle(manifest, routes, "ecp:accepts", "by-tier-silver").edgeId)).toBe(true)
    const d = composedEdgeRoute(manifest, routes, "ecp:accepts", "by-tier-silver")
    expect(pathBoundingBox(d).width).toBeGreaterThan(20)
  })

  it("rail: two branches from one port run on separate lanes at least the lane spacing apart", () => {
    const fixture = path.resolve(patternsDir, "../../fixtures/manifests/valid/markers.ecp.json")
    const manifest = JSON.parse(readFileSync(fixture, "utf8")) as ExecutionManifest
    const map = routesFor(manifest)
    const toFromExpr = [...map.entries()].find(([id]) => id.startsWith("data-seed-fromExpr"))
    const toMarked = [...map.entries()].find(([id]) => id.startsWith("data-seed-marked"))
    expect(toFromExpr).toBeDefined()
    expect(toMarked).toBeDefined()
    const laneA = pathStartPoint(toFromExpr![1]).y
    const laneB = pathStartPoint(toMarked![1]).y
    expect(Math.abs(laneA - laneB)).toBeGreaterThanOrEqual(BRANCH_LANE_SPACING - 0.01)
  })

  it("rail: lanes are stable whatever order the branches are routed in", () => {
    const fixture = path.resolve(patternsDir, "../../fixtures/manifests/valid/markers.ecp.json")
    const manifest = JSON.parse(readFileSync(fixture, "utf8")) as ExecutionManifest
    const laid = executionToReactFlow(manifest)
    const edges = extractDataEdges(manifest.steps ?? [], new Set()).map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? "output",
      target: edge.target,
      targetHandle: edge.targetHandle ?? "value",
    }))
    const forward = computeBranchRoutes({ roots: manifest.steps ?? [], laidNodes: laid.nodes, edges, manifest })
    const reverse = computeBranchRoutes({ roots: manifest.steps ?? [], laidNodes: laid.nodes, edges: [...edges].reverse(), manifest })
    const lanes = (map: Map<string, string>) => new Set([...map.values()].map((d) => pathStartPoint(d).y))
    expect(lanes(reverse)).toEqual(lanes(forward))
  })

  it("compose: a branch leaves its lane over the entry curve, not at the port", () => {
    const d = composeBranchPath(0, 0, 200, 40, "M 10 0 L 190 0")
    expect(d).toContain(`L ${190 - BRANCH_ENTRY_CURVE} 0`)
    expect(pathEndPoint(d)).toEqual({ x: 200, y: 40 })
  })

  it("compose: a level run already on the port's height is left alone", () => {
    expect(composeBranchPath(0, 0, 200, 0, "M 10 0 L 190 0")).toContain("L 190 0")
  })

  it("compose: a run shorter than the entry curve keeps its start", () => {
    const d = composeBranchPath(0, 0, 40, 30, "M 10 0 L 20 0")
    expect(d).toContain("L 11 0")
  })

  it("nested controls: an if inside a parallel path and a loop inside an else route every branch", () => {
    const echo = (id: string, value: unknown) => ({ id, uses: "@executioncontrolprotocol/test.echo", input: { value }, as: id })
    const manifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        echo("seed", "x"),
        {
          type: "parallel",
          id: "fan",
          paths: [
            [
              echo("prep", { $ref: "state.seed.echo" }),
              {
                type: "if",
                id: "gate",
                accepts: { type: "object", properties: { v: {} } },
                input: { v: { $ref: "state.prep.echo" } },
                expression: "true",
                as: "gate",
                then: [echo("yes", { $ref: "state.prep.echo" })],
                else: [
                  {
                    type: "loop",
                    id: "spin",
                    mode: "for",
                    as: "round",
                    input: { count: 2 },
                    steps: [echo("inner", { $ref: "state.seed.echo" })],
                  },
                  echo("after-spin", { $ref: "state.inner.echo" }),
                ],
              },
              echo("after-gate", { $ref: "state.yes.echo" }),
            ],
            [echo("other", { $ref: "state.seed.echo" })],
          ],
        },
      ],
    } as unknown as ExecutionManifest
    const routes = routesFor(manifest)
    const dataEdges = extractDataEdges(manifest.steps ?? [], new Set())
    for (const target of ["prep", "yes", "inner", "after-spin", "after-gate", "other"]) {
      const edge = dataEdges.find((entry) => entry.target === target)
      expect(edge, target).toBeDefined()
      expect(routes.get(edge!.id), target).toMatch(/^M -?[\d.]+ -?[\d.]+/)
    }
  })

  it("pathMidpoint and pathBoundingBox handle a lone move and an empty path", () => {
    expect(pathMidpoint("M 3 4")).toEqual({ x: 3, y: 4 })
    expect(pathMidpoint("")).toEqual({ x: 0, y: 0 })
    expect(pathBoundingBox("")).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it("a then/else handle on a plain step is not routed as a tunnel", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest)
    const routes = computeBranchRoutes({
      roots: manifest.steps ?? [],
      laidNodes: laid.nodes,
      edges: [{ id: "fake", source: "ship", sourceHandle: "then", target: "notify", targetHandle: "value" }],
      manifest,
    })
    expect(routes.has("fake")).toBe(false)
  })

  it("compose: empty middle is a direct port-to-port curve", () => {
    const d = composeBranchPath(0, 10, 100, 20, "")
    expect(pathStartPoint(d).x).toBe(0)
    expect(pathStartPoint(d).y).toBe(10)
    expect(pathEndPoint(d).x).toBe(100)
    expect(pathEndPoint(d).y).toBe(20)
  })

  it("compose: rejects degenerate middle without throwing", () => {
    const d = composeBranchPath(5, 5, 50, 50, "M 30 30 L 40 30")
    expect(d.length).toBeGreaterThan(8)
    expect(pathEndPoint(d).x).toBe(50)
    expect(pathEndPoint(d).y).toBe(50)
  })

  it("compose: every pattern $ref has a middle route or is absent from map only when detached", () => {
    const patternNames = [
      "if-in-loop.ecp.json",
      "branch.ecp.json",
      "parallel.ecp.json",
      "loop-for.ecp.json",
      "loop-foreach.ecp.json",
      "nested-foreach-branch.ecp.json",
      "nested-parallel.ecp.json",
    ]
    for (const name of patternNames) {
      const manifest = loadPattern(name)
      const routes = routesFor(manifest)
      const dataEdges = extractDataEdges(manifest.steps ?? [], acceptKeys(manifest))
      for (const edge of dataEdges) {
        expect(routes.has(edge.id), `${name} missing route for ${edge.id}`).toBe(true)
      }
    }
  })
})