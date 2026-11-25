import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  executionToReactFlow,
  EXECUTION_ACCEPTS_NODE_ID,
  loopEndNodeId,
  LOOP_ITEMS_HANDLE,
  IF_THEN_HANDLE,
  END_RESULTS_HANDLE,
} from "../../src/graph/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const patternsDir = path.resolve(here, "../../../../examples/patterns")
const patternNames = readdirSync(patternsDir).filter((name) => name.endsWith(".ecp.json")).sort()

function loadPattern(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(patternsDir, name), "utf8")) as ExecutionManifest
}

describe("executionToReactFlow", () => {
  it.each(patternNames)("%s publishes data branches only", (name) => {
    const doc = executionToReactFlow(loadPattern(name))
    expect(doc.nodes.length).toBeGreaterThan(0)
    expect(doc.edges.every((edge) => edge.data.kind === "data")).toBe(true)
  })
  it("encodes pattern branch with if node and data edges only", () => {
    const doc = executionToReactFlow(loadPattern("branch.ecp.json"))
    expect(doc.nodes.some((n) => n.type === "ecp-if" && n.id === "by-tier")).toBe(true)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
    expect(doc.edges.some((e) => e.target === "start" && e.source === EXECUTION_ACCEPTS_NODE_ID)).toBe(true)
    expect(doc.edges.some((e) => e.targetHandle === IF_THEN_HANDLE)).toBe(false)
  })

  it("encodes foreach loop with end node and items port", () => {
    const doc = executionToReactFlow(loadPattern("loop-foreach.ecp.json"))
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")
    expect(loop).toBeDefined()
    expect(doc.nodes.some((n) => n.id === loopEndNodeId(loop!.id))).toBe(true)
    expect(doc.edges.some((e) => e.targetHandle === LOOP_ITEMS_HANDLE)).toBe(true)
    expect(doc.edges.some((e) => e.sourceHandle === END_RESULTS_HANDLE)).toBe(true)
  })

  it("encodes parallel with start node and frames", () => {
    const doc = executionToReactFlow(loadPattern("parallel.ecp.json"))
    expect(doc.nodes.some((n) => n.type === "ecp-parallel")).toBe(true)
    expect(doc.nodes.some((n) => n.type === "ecp-frame")).toBe(true)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
  })

  it("literal-only steps may have no data edges", () => {
    const manifest = loadPattern("branch.ecp.json")
    const doc = executionToReactFlow(manifest)
    const literalOnly = doc.nodes.find((n) => n.id === "gold-offer" || n.id === "default-offer")
    if (literalOnly) {
      const hasEdge = doc.edges.some((e) => e.source === literalOnly.id || e.target === literalOnly.id)
      expect(hasEdge).toBe(false)
    }
  })
})