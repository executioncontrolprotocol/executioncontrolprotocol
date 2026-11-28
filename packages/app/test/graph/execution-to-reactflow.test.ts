import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  executionToReactFlow,
  EXECUTION_ACCEPTS_NODE_ID,
  EMPTY_INPUT_PORT_ID,
  endMarkerId,
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
    expect(doc.nodes.some((n) => n.id === endMarkerId(loop!.id, "loop"))).toBe(true)
    expect(doc.edges.some((e) => e.targetHandle === LOOP_ITEMS_HANDLE)).toBe(true)
    const end = doc.nodes.find((n) => n.id === endMarkerId(loop!.id, "loop"))!
    expect((end.data as { label: string }).label).toBe("end loop")
  })

  it("encodes parallel with start node, end node, and tunnels", () => {
    const doc = executionToReactFlow(loadPattern("parallel.ecp.json"))
    const parallel = doc.nodes.find((n) => n.type === "ecp-parallel")
    expect(parallel).toBeDefined()
    expect(doc.nodes.some((n) => n.id === endMarkerId(parallel!.id, "path-1"))).toBe(true)
    expect(doc.nodes.some((n) => n.id === endMarkerId(parallel!.id, "path-2"))).toBe(true)
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
        expect(data.memberNodeIds).toContain(endMarkerId(data.structureId, "loop"))
        expect(data.controlNodeId).toBe(data.structureId)
      }
      if (data.tunnelKind === "then" || data.tunnelKind === "else") {
        expect(data.memberNodeIds).not.toContain(endMarkerId(data.structureId, data.tunnelKind))
        expect(data.controlNodeId).toBe(data.structureId)
        expect(data.endNodeId).toBe(endMarkerId(data.structureId, data.tunnelKind))
      }
      if (data.tunnelKind === "path") {
        const pathN = data.label.replace(/^path /, "")
        expect(data.endNodeId).toBe(endMarkerId(data.structureId, `path-${pathN}`))
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
    expect(data.memberNodeIds).not.toContain(endMarkerId("by-tier", "then"))
    expect(data.memberNodeIds).not.toContain(endMarkerId("by-tier", "else"))
  })

  it("loop-foreach pattern emits loop tunnel wrapping end", () => {
    const doc = executionToReactFlow(loadPattern("loop-foreach.ecp.json"))
    const loop = doc.nodes.find((n) => n.type === "ecp-loop")!
    const tunnel = doc.nodes.find((n) => n.id === `ecp:tunnel:${loop.id}:loop`)!
    const data = tunnel.data as ReactFlowTunnelData
    expect(data.memberNodeIds).toContain(loop.id)
    expect(data.memberNodeIds).toContain(endMarkerId(loop.id, "loop"))
  })

  it("if-in-loop nests if tunnels inside loop tunnel and labels ends", () => {
    const doc = executionToReactFlow(loadPattern("if-in-loop.ecp.json"))
    const loopTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:each-order:loop")
    const thenTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:express:then")
    const elseTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:express:else")
    expect(loopTunnel && thenTunnel && elseTunnel).toBeTruthy()
    expect(doc.nodes.some((n) => n.id === endMarkerId("express", "then"))).toBe(true)
    expect(doc.nodes.some((n) => n.id === endMarkerId("express", "else"))).toBe(true)
    expect(doc.nodes.some((n) => n.id === endMarkerId("each-order", "loop"))).toBe(true)
    const ends = doc.nodes.filter((n) => n.type === "ecp-end")
    expect(ends.map((n) => (n.data as { label: string }).label).sort()).toEqual(["end else", "end loop", "end then"])
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

  it("if with empty else still draws else tunnel and both end markers", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "solo", expression: "true", then: [{ id: "t", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }] }],
    }
    const doc = executionToReactFlow(manifest)
    expect(doc.nodes.some((n) => n.id === "ecp:tunnel:solo:else")).toBe(true)
    expect(doc.nodes.some((n) => n.id === endMarkerId("solo", "then"))).toBe(true)
    expect(doc.nodes.some((n) => n.id === endMarkerId("solo", "else"))).toBe(true)
    const endElse = doc.nodes.find((n) => n.id === endMarkerId("solo", "else"))!
    expect((endElse.data as { label: string }).label).toBe("end else")
  })

  it("if and parallel control nodes include an empty input port", () => {
    const doc = executionToReactFlow(loadPattern("branch.ecp.json"))
    const gate = doc.nodes.find((n) => n.id === "by-tier")
    const inputs = (gate!.data as { inputs: Array<{ id: string }> }).inputs
    expect(inputs.some((port) => port.id === EMPTY_INPUT_PORT_ID)).toBe(true)
  })

  it("transform steps show an empty port when capability metadata says script step", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          id: "xf",
          uses: "@executioncontrolprotocol/core.transform",
          accepts: { type: "object", properties: { a: { type: "string" } } },
          script: { lang: "js", source: "return input" },
        },
      ],
    }
    const doc = executionToReactFlow(manifest, {
      capabilityMeta: { "@executioncontrolprotocol/core.transform": { contract: "step", code: "script" } },
    })
    const inputs = (doc.nodes.find((n) => n.id === "xf")!.data as { inputs: Array<{ id: string }> }).inputs
    expect(inputs.some((port) => port.id === EMPTY_INPUT_PORT_ID)).toBe(true)
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