import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  executionToReactFlow,
  EXECUTION_ACCEPTS_NODE_ID,
  structureEndNodeId,
  LOOP_ITEMS_HANDLE,
  IF_THEN_HANDLE,
  type ReactFlowTunnelData,
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
    expect(doc.nodes.some((n) => n.id === structureEndNodeId(loop!.id))).toBe(true)
    expect(doc.edges.some((e) => e.targetHandle === LOOP_ITEMS_HANDLE)).toBe(true)
    const end = doc.nodes.find((n) => n.id === structureEndNodeId(loop!.id))!
    expect((end.data as { label: string }).label).toBe("end loop")
  })

  it("encodes parallel with start node, end node, and tunnels", () => {
    const doc = executionToReactFlow(loadPattern("parallel.ecp.json"))
    const parallel = doc.nodes.find((n) => n.type === "ecp-parallel")
    expect(parallel).toBeDefined()
    expect(doc.nodes.some((n) => n.id === structureEndNodeId(parallel!.id))).toBe(true)
    expect(doc.nodes.some((n) => n.type === "ecp-tunnel")).toBe(true)
    expect(doc.edges.every((e) => e.data.kind === "data")).toBe(true)
  })

  it.each(patternNames)("%s tunnels expose member nodes", (name) => {
    const doc = executionToReactFlow(loadPattern(name))
    const tunnels = doc.nodes.filter((n) => n.type === "ecp-tunnel")
    for (const tunnel of tunnels) {
      const data = tunnel.data as ReactFlowTunnelData
      expect(data.structureId.length).toBeGreaterThan(0)
      expect(data.memberNodeIds.length).toBeGreaterThan(0)
      expect(tunnel.id.startsWith("ecp:tunnel:")).toBe(true)
      if (data.tunnelKind === "loop") {
        expect(data.memberNodeIds).toContain(structureEndNodeId(data.structureId))
        expect(data.controlNodeId).toBe(data.structureId)
      }
      if (data.tunnelKind === "then" || data.tunnelKind === "else") {
        expect(data.memberNodeIds).not.toContain(structureEndNodeId(data.structureId))
        expect(data.controlNodeId).toBe(data.structureId)
        expect(data.endNodeId).toBe(structureEndNodeId(data.structureId))
      }
      if (data.tunnelKind === "path") {
        expect(data.label.startsWith("path ")).toBe(true)
      }
    }
  })

  it("branch pattern if tunnel uses then and else ids", () => {
    const doc = executionToReactFlow(loadPattern("branch.ecp.json"))
    const then = doc.nodes.find((n) => n.id === "ecp:tunnel:by-tier:then")
    const elseTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:by-tier:else")
    expect(then).toBeDefined()
    expect(elseTunnel).toBeDefined()
    const data = then!.data as ReactFlowTunnelData
    expect(data.tunnelKind).toBe("then")
    expect(data.memberNodeIds).toContain("gold-offer")
    expect(data.memberNodeIds).not.toContain("by-tier")
    expect(data.memberNodeIds).not.toContain(structureEndNodeId("by-tier"))
  })

  it("loop-foreach pattern emits loop tunnel wrapping end", () => {
    const doc = executionToReactFlow(loadPattern("loop-foreach.ecp.json"))
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")!
    const tunnel = doc.nodes.find((n) => n.id === `ecp:tunnel:${loop.id}:loop`)!
    const data = tunnel.data as ReactFlowTunnelData
    expect(data.memberNodeIds).toContain(loop.id)
    expect(data.memberNodeIds).toContain(structureEndNodeId(loop.id))
  })

  it("if-in-loop nests if tunnels inside loop tunnel and labels ends", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const loopTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:each-order:loop")
    const thenTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:express:then")
    const elseTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:express:else")
    expect(loopTunnel && thenTunnel && elseTunnel).toBeTruthy()
    expect(doc.nodes.some((n) => n.id === structureEndNodeId("express"))).toBe(true)
    expect(doc.nodes.some((n) => n.id === structureEndNodeId("each-order"))).toBe(true)
    const ends = doc.nodes.filter((n) => n.type === "ecp-end")
    expect(ends.map((n) => (n.data as { label: string }).label).sort()).toEqual(["end if", "end loop"])
  })

  it("if-in-loop ship merge port shows two branches; notify input is array across loop", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const ship = doc.nodes.find((n) => n.id === "ship")!
    const shipData = ship.data as { inputs: Array<{ id: string; refBranchCount?: number }> }
    const pickPort = shipData.inputs.find((p) => p.id === "value")
    expect(pickPort?.refBranchCount).toBe(2)
    const notify = doc.nodes.find((n) => n.id === "notify")!
    const notifyPort = (notify.data as { inputs: Array<{ id: string; typeLabel: string }> }).inputs.find(
      (p) => p.id === "value",
    )
    expect(notifyPort?.typeLabel).toMatch(/\[\]$/)
  })

  it("merge list ref on a step input sets refBranchCount on the port", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "reader",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: ["state.a", "state.b"] } },
        },
      ],
    }
    const doc = executionToReactFlow(manifest)
    const port = (doc.nodes.find((n) => n.id === "reader")!.data as { inputs: Array<{ refBranchCount?: number }> }).inputs[0]
    expect(port?.refBranchCount).toBe(2)
  })

  it("if with empty else still draws else tunnel and end if", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "solo", expression: "true", then: [{ id: "t", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }] }],
    }
    const doc = executionToReactFlow(manifest)
    expect(doc.nodes.some((n) => n.id === "ecp:tunnel:solo:else")).toBe(true)
    expect(doc.nodes.some((n) => n.id === structureEndNodeId("solo"))).toBe(true)
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