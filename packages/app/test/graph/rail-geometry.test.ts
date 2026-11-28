import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  alignEndMarkersToBandEdges,
  computeSideBand,
  controlNestingDepth,
  inputHandleY,
  joinBranchPathD,
  joinPathD,
  mergeXAfterStructure,
  neckPathD,
  outputHandleY,
  sideHandleId,
  subtreeIds,
} from "../../src/graph/rail-geometry.js"
import { executionToReactFlow } from "../../src/graph/index.js"

const patternsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../examples/patterns")

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

describe("rail-geometry", () => {
  it("sideHandleId maps then, else and path handles", () => {
    expect(sideHandleId("then")).toBe("then")
    expect(sideHandleId("else")).toBe("else")
    expect(sideHandleId("path", 2)).toBe("path-2")
  })

  it("neck and join paths are non-empty for if-in-loop", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes
    const byId = new Map(laid.map((node) => [node.id, node]))
    const express = byId.get("express")!
    const marker = byId.get("end:express:then")!
    const loop = manifest.steps!.find((node) => node.type === "loop")!
    const innerIf = loop.type === "loop" ? loop.steps.find((node) => node.type === "if") : undefined
    const thenNodes = innerIf?.type === "if" ? innerIf.then : []
    const band = computeSideBand(express, marker, thenNodes, byId)
    expect(neckPathD(express, "then", band)).toMatch(/^M /)
    expect(joinPathD(marker, mergeXAfterStructure("express", laid), 100)).toContain("C")
    expect(joinBranchPathD(marker, 300, 400, 200, 205)).toContain("C")
  })

  it("subtreeIds and controlNestingDepth cover nested controls", () => {
    const manifest = loadPattern("nested-parallel.ecp.json")
    const steps = manifest.steps ?? []
    expect(controlNestingDepth(steps)).toBeGreaterThan(0)
    expect(subtreeIds(steps).length).toBeGreaterThan(5)
  })

  it("inputHandleY and outputHandleY on IO nodes follow port order", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const inputs = executionToReactFlow(manifest).nodes.find((node) => node.id === "ecp:accepts")!
    expect(inputHandleY(inputs, "orders")).toBeGreaterThan(inputs.position.y)
    expect(outputHandleY(inputs, "orders")).toBeGreaterThan(inputs.position.y)
  })

  it("outputHandleY follows port order on a step", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const ship = executionToReactFlow(manifest).nodes.find((node) => node.id === "ship")!
    expect(outputHandleY(ship, "output")).toBeGreaterThan(ship.position.y)
  })
  it("alignEndMarkersToBandEdges leaves nodes alone when end markers are missing", () => {
    for (const name of ["if-in-loop.ecp.json", "parallel.ecp.json", "nested-parallel.ecp.json"]) {
      const manifest = loadPattern(name)
      const laid = executionToReactFlow(manifest).nodes.filter((node) => node.type !== "ecp-end")
      const aligned = alignEndMarkersToBandEdges(manifest.steps ?? [], laid)
      expect(aligned.map((node) => node.position)).toEqual(laid.map((node) => node.position))
    }
  })

  it("alignEndMarkersToBandEdges puts the loop label inside the loop tunnel's top edge", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const laid = executionToReactFlow(manifest).nodes
    const marker = laid.find((node) => node.id === "end:each-order:loop")
    const body = laid.filter((node) => ["express", "ship"].includes(node.id))
    expect(marker).toBeDefined()
    expect(body.length).toBe(2)
    expect(marker!.position.y).toBeLessThan(Math.min(...body.map((node) => node.position.y)))
  })

  it("port Y helpers fall back to the first row for nodes without ports", () => {
    const manifest = loadPattern("if-in-loop.ecp.json")
    const end = executionToReactFlow(manifest).nodes.find((node) => node.type === "ecp-end")
    expect(end).toBeDefined()
    expect(outputHandleY(end!, "missing")).toBe(inputHandleY(end!, "missing"))
  })
})