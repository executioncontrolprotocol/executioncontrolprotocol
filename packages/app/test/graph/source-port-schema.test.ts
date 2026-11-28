import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { OUTPUT_HANDLE_ID } from "../../src/graph/extract-data-edges.js"
import { schemaFromReactFlowPort, sourcePortPropertySchema } from "../../src/graph/source-port-schema.js"
import { IF_THEN_HANDLE, LOOP_ITEM_HANDLE } from "../../src/graph/types.js"

const echo = "@executioncontrolprotocol/test.echo"

describe("sourcePortPropertySchema", () => {
  const manifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    execution: {
      id: "m",
      accepts: {
        type: "object",
        properties: { tier: { type: "string", enum: ["a", "b"] } },
      },
    },
    steps: [
      {
        id: "writer",
        uses: echo,
        as: "writer",
        returns: { type: "object", properties: { text: { type: "string" } } },
      },
      {
        type: "if",
        id: "gate",
        expression: "true",
        accepts: { type: "object", properties: { note: { type: "string" } } },
        then: [],
      },
      {
        type: "parallel",
        id: "p",
        accepts: { type: "object", properties: { doc: { type: "object" } } },
        paths: [[], []],
      },
      {
        type: "loop",
        id: "rows",
        mode: "forEach",
        as: "row",
        input: { items: { $ref: "state.rows" } },
        steps: [],
      },
    ],
  }

  it("reads execution input, step field, whole output and control side ports", () => {
    expect(sourcePortPropertySchema(manifest, "ecp:accepts", "tier")).toMatchObject({ type: "string" })
    expect(sourcePortPropertySchema(manifest, "writer", "text")).toEqual({ type: "string" })
    expect(sourcePortPropertySchema(manifest, "writer", OUTPUT_HANDLE_ID).type).toBe("object")
    expect(sourcePortPropertySchema(manifest, "gate", IF_THEN_HANDLE).type).toBe("object")
    expect(sourcePortPropertySchema(manifest, "p", "path-1").type).toBe("object")
    expect(sourcePortPropertySchema(manifest, "gate", "note")).toEqual({ type: "string" })
  })

  it("returns object for loop item and empty for unknown nodes", () => {
    expect(sourcePortPropertySchema(manifest, "rows", LOOP_ITEM_HANDLE)).toEqual({ type: "object" })
    expect(sourcePortPropertySchema(manifest, "missing", "x")).toEqual({})
  })

  it("schemaFromReactFlowPort prefers typed hints", () => {
    expect(schemaFromReactFlowPort({ id: "x", name: "x", typeLabel: "string", valueSchema: { type: "integer" } })).toEqual({
      type: "integer",
    })
    expect(schemaFromReactFlowPort({ id: "x", name: "x", typeLabel: "unknown" })).toEqual({})
  })
})