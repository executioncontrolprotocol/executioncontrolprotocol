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

  it("placementAtFlowPoint resolves a parallel path index", () => {
    const parallel: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "fan",
          paths: [
            [{ id: "a", uses: "@executioncontrolprotocol/test.echo", input: { value: "1" } }],
            [{ id: "b", uses: "@executioncontrolprotocol/test.echo", input: { value: "2" } }],
          ],
        },
      ],
    }
    const doc = executionToReactFlow(parallel)
    const pathTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:fan:path-2")!
    const point = {
      x: pathTunnel.position.x + 12,
      y: pathTunnel.position.y + Number(pathTunnel.style?.height) / 2,
    }
    expect(placementAtFlowPoint(parallel, doc, point)).toEqual({ kind: "path-side", parallelId: "fan", pathIndex: 1 })
  })

  it("placementAtFlowPoint returns after-node when the point is right of an existing step", () => {
    const doc = executionToReactFlow(manifest)
    const thenTunnel = doc.nodes.find((n) => n.id === "ecp:tunnel:gate:then")!
    const yes = doc.nodes.find((n) => n.id === "yes")!
    const point = {
      x: yes.position.x + Number(yes.style?.width ?? 200) + 4,
      y: thenTunnel.position.y + Number(thenTunnel.style?.height) / 2,
    }
    expect(placementAtFlowPoint(manifest, doc, point)).toEqual({ kind: "after", nodeId: "yes" })
  })
})