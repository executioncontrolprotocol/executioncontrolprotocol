import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { returnsReactFlowNode, returnsSourceKeys } from "../../src/graph/io-from-schema.js"

describe("returnsSourceKeys", () => {
  it("includes step as keys from the body but not loop item aliases", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "inner" }],
        },
        { id: "tail", uses: "@executioncontrolprotocol/test.echo", input: { value: "done" }, as: "tailOut" },
      ],
    }
    const keys = returnsSourceKeys(manifest)
    expect(keys.has("inner")).toBe(true)
    expect(keys.has("row")).toBe(false)
    expect(keys.has("tailOut")).toBe(true)
  })

  it("wires returns ports only to keys that exist in the graph", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        returns: { type: "object", properties: { inner: { type: "string" }, missing: { type: "string" } } },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "inner" }],
        },
      ],
    }
    const node = returnsReactFlowNode(manifest)
    expect(node).toBeDefined()
    const ports = node!.data.inputs
    expect(ports.find((port) => port.id === "inner")?.binding).toBe("ref")
    expect(ports.find((port) => port.id === "missing")?.binding).toBeUndefined()
  })
})