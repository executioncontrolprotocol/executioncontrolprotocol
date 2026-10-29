import { describe, expect, it } from "vitest"
import {
  discoveryOriginFromConnection,
  shouldOpenCapabilityDiscovery,
} from "../src/ui/lib/capability-discovery.js"

describe("shouldOpenCapabilityDiscovery", () => {
  it("opens when a handle is dropped on empty canvas", () => {
    expect(
      shouldOpenCapabilityDiscovery({
        readOnly: false,
        fromNodeId: "echo",
        fromHandleId: "output",
        toNodeId: null,
      })
    ).toBe(true)
  })

  it("does not open when the drop lands on a node", () => {
    expect(
      shouldOpenCapabilityDiscovery({
        readOnly: false,
        fromNodeId: "echo",
        fromHandleId: "output",
        toNodeId: "next",
      })
    ).toBe(false)
  })

  it("does not open when read-only or the origin handle is missing", () => {
    expect(
      shouldOpenCapabilityDiscovery({
        readOnly: true,
        fromNodeId: "echo",
        fromHandleId: "output",
      })
    ).toBe(false)
    expect(
      shouldOpenCapabilityDiscovery({
        readOnly: false,
        fromNodeId: "echo",
        fromHandleId: null,
      })
    ).toBe(false)
  })
})

describe("discoveryOriginFromConnection", () => {
  it("copies the origin handle and port", () => {
    const origin = discoveryOriginFromConnection({
      fromNodeId: "ecp:accepts",
      fromHandleId: "+",
      fromHandleType: "source",
      port: { id: "+", name: "+", typeLabel: "unknown" },
    })
    expect(origin).toMatchObject({
      nodeId: "ecp:accepts",
      handleId: "+",
      handleType: "source",
      port: { typeLabel: "unknown" },
    })
  })
})
