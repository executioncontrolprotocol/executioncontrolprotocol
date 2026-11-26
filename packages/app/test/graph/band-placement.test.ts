import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow, placementAtFlowPoint, tunnelAtFlowPoint } from "../../src/graph/index.js"

describe("placement inside tunnels", () => {
  const manifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        type: "if",
        id: "gate",
        expression: "true",
        then: [{ id: "yes", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" } }],
        else: [{ id: "no", uses: "@executioncontrolprotocol/test.echo", input: { value: "n" } }],
      },
    ],
  }

  it("tunnelAtFlowPoint picks the deepest tunnel at a point", () => {
    const doc = executionToReactFlow(manifest)
    const tunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:gate:then")!
    const center = {
      x: tunnel.position.x + Number(tunnel.style?.width) / 2,
      y: tunnel.position.y + Number(tunnel.style?.height) / 2,
    }
    const hit = tunnelAtFlowPoint(doc, center)
    expect(hit?.tunnelId).toBe("ecp:tunnel:gate:then")
    expect(tunnelAtFlowPoint(doc, { x: -100, y: -100 })).toBeUndefined()
  })

  it("placementAtFlowPoint resolves then vs else from the tunnel kind", () => {
    const doc = executionToReactFlow(manifest)
    const elseTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:gate:else")!
    const point = {
      x: elseTunnel.position.x + 20,
      y: elseTunnel.position.y + Number(elseTunnel.style?.height) / 2,
    }
    expect(placementAtFlowPoint(manifest, doc, point)).toEqual({ kind: "else-side", ifId: "gate" })
  })
})