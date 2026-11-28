import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { computeRailVisualLayer, executionToReactFlow, EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "../../src/graph/index.js"
import { parseEndMarkerId } from "../../src/graph/types.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

describe("rail visual layer (replaces join tunnel nodes)", () => {
  it("if-in-loop emits a root rail path", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes
    const shapes = computeRailVisualLayer(manifest.steps, laid, undefined, {
      acceptsId: EXECUTION_ACCEPTS_NODE_ID,
      returnsId: EXECUTION_RETURNS_NODE_ID,
    })
    expect(shapes.some((shape) => shape.kind === "path" && shape.testId === "ecp-rail-root")).toBe(true)
    expect(laid.some((n) => n.id === "ecp:tunnel:rail:root")).toBe(false)
  })

  it("emits one join path per if side", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes
    const shapes = computeRailVisualLayer(manifest.steps, laid, undefined, {
      acceptsId: EXECUTION_ACCEPTS_NODE_ID,
      returnsId: EXECUTION_RETURNS_NODE_ID,
    })
    expect(shapes.some((shape) => shape.kind === "path" && shape.testId === "ecp-join-express-then")).toBe(true)
    expect(shapes.some((shape) => shape.kind === "path" && shape.testId === "ecp-join-express-else")).toBe(true)
  })

  it("parseEndMarkerId rejects legacy single-segment ids", () => {
    expect(parseEndMarkerId("end:nope")).toBeUndefined()
  })
})