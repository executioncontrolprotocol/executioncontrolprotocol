import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  JOIN_RIBBON_WIDTH,
  RAIL_STROKE_WIDTH,
  computeRailVisualLayer,
  controlNestingDepth,
  executionToReactFlow,
  roundedRectPath,
  type RailLabelShape,
  type RailPathShape,
  type RailVisualShape,
  type ReactFlowNode,
} from "../../src/graph/index.js"
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../../src/graph/layout.js"
import { nodeBox } from "../../src/graph/tunnel-geometry.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

function layer(manifest: ExecutionManifest, choices?: Record<string, "then" | "else" | null>) {
  const laid = executionToReactFlow(manifest).nodes
  const shapes = computeRailVisualLayer(
    manifest.steps,
    laid,
    undefined,
    { acceptsId: EXECUTION_ACCEPTS_NODE_ID, returnsId: EXECUTION_RETURNS_NODE_ID },
    choices ? { choices } : undefined,
  )
  return { laid, shapes }
}

function nodeById(nodes: readonly ReactFlowNode[], id: string): ReactFlowNode {
  const node = nodes.find((entry) => entry.id === id)
  if (!node) throw new Error(`missing node ${id}`)
  return node
}

function box(nodes: readonly ReactFlowNode[], id: string) {
  return nodeBox(nodeById(nodes, id), DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
}

function paths(shapes: readonly RailVisualShape[]): RailPathShape[] {
  return shapes.filter((shape): shape is RailPathShape => shape.kind === "path")
}

function labels(shapes: readonly RailVisualShape[]): RailLabelShape[] {
  return shapes.filter((shape): shape is RailLabelShape => shape.kind === "label")
}

function shape(shapes: readonly RailVisualShape[], testId: string): RailPathShape {
  const found = paths(shapes).find((entry) => entry.testId === testId)
  if (!found) throw new Error(`missing shape ${testId}`)
  return found
}

/** Last "x y" pair of an SVG path. */
function pathEndPoint(d: string): { x: number; y: number } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  return { x: numbers[numbers.length - 2]!, y: numbers[numbers.length - 1]! }
}

/** First "x y" pair of an SVG path. */
function pathStartPoint(d: string): { x: number; y: number } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  return { x: numbers[0]!, y: numbers[1]! }
}

describe("computeRailVisualLayer", () => {
  it("if-in-loop: a grey rail runs from Inputs to Notify on the root centre line", () => {
    const { laid, shapes } = layer(loadPattern("if-in-loop.ecp.json"))
    const rail = shape(shapes, "ecp-rail-root")
    expect(rail.dataKind).toBe("rail")
    expect(rail.stroke).toBe("#8b949e")
    expect(rail.strokeWidth).toBeGreaterThanOrEqual(RAIL_STROKE_WIDTH)
    const start = pathStartPoint(rail.d)
    const end = pathEndPoint(rail.d)
    const inputs = box(laid, EXECUTION_ACCEPTS_NODE_ID)
    const notify = box(laid, "notify")
    expect(start.x).toBeLessThanOrEqual(inputs.x + 1)
    expect(end.x).toBeGreaterThanOrEqual(notify.x + notify.width - 1)
    expect(Math.abs(start.y - (notify.y + notify.height / 2))).toBeLessThanOrEqual(2)
  })

  it("if-in-loop: then and else are filled bands around their own nodes, not overlapping", () => {
    const { laid, shapes } = layer(loadPattern("if-in-loop.ecp.json"))
    const thenBand = shape(shapes, "ecp-side-express-then")
    const elseBand = shape(shapes, "ecp-side-express-else")
    expect(thenBand.fill).toBe("#3fb950")
    expect(elseBand.fill).toBe("#f85149")
    const fast = box(laid, "pick-fast")
    const standard = box(laid, "pick-standard")
    const t = thenBand.box!
    const e = elseBand.box!
    // then wraps Pick fast with padding and stops above Pick standard; else the reverse.
    expect(t.y).toBeLessThan(fast.y)
    expect(t.y + t.height).toBeGreaterThan(fast.y + fast.height)
    expect(t.y + t.height).toBeLessThan(standard.y)
    expect(e.y).toBeGreaterThan(fast.y + fast.height)
    expect(e.y + e.height).toBeGreaterThan(standard.y + standard.height)
    expect(t.y + t.height).toBeLessThanOrEqual(e.y)
    // Each band starts right of the control node and ends just past its own end marker.
    const express = box(laid, "express")
    for (const [band, side] of [
      [t, "then"],
      [e, "else"],
    ] as const) {
      const marker = box(laid, `end:express:${side}`)
      expect(band.x).toBeGreaterThanOrEqual(express.x + express.width)
      expect(band.x + band.width).toBeGreaterThan(marker.x + marker.width)
      expect(band.x + band.width).toBeLessThan(marker.x + marker.width + 40)
    }
    // A neck ribbon joins each side's port to its band.
    expect(shape(shapes, "ecp-side-neck-express-then").strokeWidth).toBe(JOIN_RIBBON_WIDTH)
    expect(shape(shapes, "ecp-side-neck-express-else").strokeWidth).toBe(JOIN_RIBBON_WIDTH)
  })

  it("if-in-loop: joins run from each end marker to the rail just before Ship", () => {
    const { laid, shapes } = layer(loadPattern("if-in-loop.ecp.json"))
    const ship = box(laid, "ship")
    const railY = ship.y + ship.height / 2
    for (const side of ["then", "else"] as const) {
      const marker = box(laid, `end:express:${side}`)
      const join = shape(shapes, `ecp-join-express-${side}`)
      expect(join.dataKind).toBe("join")
      expect(join.strokeWidth).toBe(JOIN_RIBBON_WIDTH)
      const start = pathStartPoint(join.d)
      const end = pathEndPoint(join.d)
      expect(start.x).toBeCloseTo(marker.x + marker.width, 0)
      expect(Math.abs(start.y - (marker.y + marker.height / 2))).toBeLessThanOrEqual(1)
      expect(end.x).toBeGreaterThan(marker.x + marker.width)
      expect(end.x).toBeLessThan(ship.x)
      expect(Math.abs(end.y - railY)).toBeLessThanOrEqual(2)
    }
  })

  it("if-in-loop: one then label, one else label, one loop title", () => {
    const { shapes } = layer(loadPattern("if-in-loop.ecp.json"))
    expect(labels(shapes).filter((entry) => entry.text === "then")).toHaveLength(1)
    expect(labels(shapes).filter((entry) => entry.text === "else")).toHaveLength(1)
    const titles = labels(shapes).filter((entry) => entry.testId === "ecp-loop-title-each-order")
    expect(titles).toHaveLength(1)
    expect(titles[0]!.text).toBe("↻ For each order")
  })

  it("if-in-loop: the loop region wraps its control node, body and end loop", () => {
    const { laid, shapes } = layer(loadPattern("if-in-loop.ecp.json"))
    const region = shapes.find((entry) => entry.kind === "loop")
    expect(region?.kind).toBe("loop")
    if (region?.kind !== "loop") return
    expect(region.strokeDasharray).toBe("7 4")
    expect(region.stroke).toBe("#a371f7")
    for (const id of ["each-order", "express", "pick-fast", "pick-standard", "ship", "end:each-order:loop"]) {
      const b = box(laid, id)
      expect(b.x).toBeGreaterThanOrEqual(region.x)
      expect(b.y).toBeGreaterThanOrEqual(region.y)
      expect(b.x + b.width).toBeLessThanOrEqual(region.x + region.width)
      expect(b.y + b.height).toBeLessThanOrEqual(region.y + region.height)
    }
    const notify = box(laid, "notify")
    expect(notify.x).toBeGreaterThan(region.x + region.width)
  })

  it("branch: joins end before Done and nested tunnels sit inside the outer else band", () => {
    const { laid, shapes } = layer(loadPattern("branch.ecp.json"))
    const done = box(laid, "done")
    for (const side of ["then", "else"] as const) {
      const end = pathEndPoint(shape(shapes, `ecp-join-by-tier-${side}`).d)
      expect(end.x).toBeLessThan(done.x)
    }
    const outerElse = shape(shapes, "ecp-side-by-tier-else").box!
    for (const side of ["then", "else"] as const) {
      const inner = shape(shapes, `ecp-side-by-tier-silver-${side}`).box!
      expect(inner.y).toBeGreaterThan(outerElse.y)
      expect(inner.y + inner.height).toBeLessThan(outerElse.y + outerElse.height)
      expect(inner.x).toBeGreaterThanOrEqual(outerElse.x)
      expect(inner.x + inner.width).toBeLessThanOrEqual(outerElse.x + outerElse.width)
    }
    // The inner if's joins end inside the outer else band.
    for (const side of ["then", "else"] as const) {
      const end = pathEndPoint(shape(shapes, `ecp-join-by-tier-silver-${side}`).d)
      expect(end.x).toBeLessThanOrEqual(outerElse.x + outerElse.width)
    }
  })

  it("parallel: one blue band per path, labelled, joined before the summary", () => {
    const { laid, shapes } = layer(loadPattern("parallel.ecp.json"))
    const summary = box(laid, "summary")
    const bands = [1, 2, 3].map((n) => shape(shapes, `ecp-side-research-path-${n}`))
    for (const band of bands) expect(band.fill).toBe("#58a6ff")
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i - 1]!.box!.y + bands[i - 1]!.box!.height).toBeLessThanOrEqual(bands[i]!.box!.y)
    }
    for (const n of [1, 2, 3]) {
      expect(pathEndPoint(shape(shapes, `ecp-join-research-path-${n}`).d).x).toBeLessThan(summary.x)
      expect(labels(shapes).some((entry) => entry.text === `path ${n}`)).toBe(true)
    }
  })

  it("run overlay dims the side an if did not take, and nothing when it took no side", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const tookThen = layer(manifest, { express: "then" }).shapes
    expect(shape(tookThen, "ecp-side-express-else").dimmed).toBe(true)
    expect(shape(tookThen, "ecp-side-express-then").dimmed).toBe(false)
    const tookElse = layer(manifest, { express: "else" }).shapes
    expect(shape(tookElse, "ecp-side-express-then").dimmed).toBe(true)
    const none = layer(manifest, { express: null }).shapes
    expect(shape(none, "ecp-side-express-then").dimmed).toBe(false)
    expect(shape(none, "ecp-side-express-else").dimmed).toBe(false)
    expect(shape(layer(manifest).shapes, "ecp-side-express-then").dimmed).toBe(false)
  })

  it("an if with no else still draws an else band around its end marker", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "gate",
          expression: "true",
          then: [{ id: "a", uses: "@executioncontrolprotocol/test.echo", input: { value: 1 }, as: "a" }],
        },
        { id: "b", uses: "@executioncontrolprotocol/test.echo", input: { value: 2 }, as: "b" },
      ],
    }
    const { laid, shapes } = layer(manifest)
    const elseBand = shape(shapes, "ecp-side-gate-else").box!
    const marker = box(laid, "end:gate:else")
    expect(elseBand.y).toBeLessThan(marker.y)
    expect(elseBand.y + elseBand.height).toBeGreaterThan(marker.y + marker.height)
    expect(pathEndPoint(shape(shapes, "ecp-join-gate-else").d).x).toBeLessThan(box(laid, "b").x)
  })

  it("nested-parallel: a loop inside a side gets its own rail inside that side's band", () => {
    const { laid, shapes } = layer(loadPattern("nested-parallel.ecp.json"))
    const loopRails = paths(shapes).filter((entry) => entry.testId.startsWith("ecp-rail-loop-"))
    expect(loopRails.length).toBeGreaterThan(0)
    for (const rail of loopRails) {
      expect(rail.dataKind).toBe("rail")
      const loopId = rail.testId.replace("ecp-rail-loop-", "")
      const control = box(laid, loopId)
      const start = pathStartPoint(rail.d)
      const end = pathEndPoint(rail.d)
      expect(start.x).toBeGreaterThan(control.x)
      expect(end.x).toBeGreaterThan(start.x)
    }
    // The top-level parallel still draws one band per path around them.
    const pathBands = paths(shapes).filter((entry) => /^ecp-side-work-path-\d$/.test(entry.testId))
    expect(pathBands.length).toBe(2)
  })

  it("skips a side whose end marker isn't laid out, and keeps the others", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes.filter((node) => node.id !== "end:express:then")
    const shapes = computeRailVisualLayer(manifest.steps, laid, undefined, {
      acceptsId: EXECUTION_ACCEPTS_NODE_ID,
      returnsId: EXECUTION_RETURNS_NODE_ID,
    })
    expect(paths(shapes).some((entry) => entry.testId === "ecp-side-express-then")).toBe(false)
    expect(paths(shapes).some((entry) => entry.testId === "ecp-join-express-then")).toBe(false)
    expect(paths(shapes).some((entry) => entry.testId === "ecp-side-express-else")).toBe(true)
    const parallel = loadPattern("parallel.ecp.json")
    const laidParallel = executionToReactFlow(parallel).nodes.filter((node) => node.id !== "end:research:path-2")
    const parallelShapes = computeRailVisualLayer(parallel.steps, laidParallel)
    expect(paths(parallelShapes).some((entry) => entry.testId === "ecp-side-research-path-2")).toBe(false)
    expect(paths(parallelShapes).some((entry) => entry.testId === "ecp-side-research-path-1")).toBe(true)
  })

  it("without Inputs / Outputs the rail spans the first to the last top-level node", () => {
    const manifest = loadPattern("parallel.ecp.json")
    const laid = executionToReactFlow(manifest).nodes
    const shapes = computeRailVisualLayer(manifest.steps, laid)
    const rail = shape(shapes, "ecp-rail-root")
    const first = box(laid, "research")
    const last = box(laid, "summary")
    expect(pathStartPoint(rail.d).x).toBeCloseTo(first.x, 0)
    expect(pathEndPoint(rail.d).x).toBeCloseTo(last.x + last.width, 0)
  })

  it("returns no shapes for an execution with no laid-out nodes on the rail", () => {
    expect(computeRailVisualLayer([], [])).toEqual([])
  })
})

describe("rail layer geometry helpers", () => {
  it("roundedRectPath closes a rounded rectangle and clamps the radius", () => {
    expect(roundedRectPath(0, 0, 100, 40, 10)).toMatch(/^M 10 0 L 90 0 A 10 10 .* Z$/)
    expect(roundedRectPath(0, 0, 20, 10, 50)).toContain("A 5 5")
    expect(roundedRectPath(0, 0, 0, 0, 4)).toContain("A 0 0")
  })

  it("controlNestingDepth counts control levels", () => {
    const step = { id: "s", uses: "x" }
    expect(controlNestingDepth([step])).toBe(0)
    expect(controlNestingDepth([{ type: "if", id: "i", expression: "true", then: [step] }])).toBe(1)
    expect(
      controlNestingDepth([
        {
          type: "if",
          id: "i",
          expression: "true",
          then: [step],
          else: [{ type: "loop", id: "l", mode: "for", as: "n", input: { count: 1 }, steps: [step] }],
        },
      ]),
    ).toBe(2)
    expect(
      controlNestingDepth([{ type: "parallel", id: "p", paths: [[step], [{ type: "parallel", id: "q", paths: [[step], [step]] }]] }]),
    ).toBe(2)
  })
})
