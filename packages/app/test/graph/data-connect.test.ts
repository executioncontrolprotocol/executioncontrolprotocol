import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import {
  dataConnectionRefusal,
  isDataHandle,
  isValidDataConnection,
  portOnDocument,
} from "../../src/graph/data-connect.js"
import { EXPR_HANDLE_ID } from "../../src/graph/extract-data-edges.js"
import { FLOW_IN_HANDLE } from "../../src/graph/types.js"

const echo = "@executioncontrolprotocol/test.echo"
const delay = "@executioncontrolprotocol/test.delay"

function manifest(): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      { id: "writer", uses: echo, input: { value: "w" }, as: "writer" },
      { id: "later", uses: echo, as: "later" },
      { id: "count", uses: delay, input: { ms: 1 }, as: "count" },
    ],
  }
}

const schemas = {
  [echo]: {
    accepts: { type: "object", properties: { value: {} } },
    returns: { type: "object" },
  },
  [delay]: {
    accepts: { type: "object", properties: { ms: { type: "integer" } }, required: ["ms"] },
    returns: { type: "object", properties: { waitedMs: { type: "integer" } } },
  },
}

describe("data-connect", () => {
  const document = executionToReactFlow(manifest(), { capabilitySchemas: schemas })

  it("detects data handles", () => {
    expect(isDataHandle("text")).toBe(true)
    expect(isDataHandle(FLOW_IN_HANDLE)).toBe(false)
    expect(isDataHandle(EXPR_HANDLE_ID)).toBe(true)
  })

  it("loads encoded ports", () => {
    const port = portOnDocument(document, "writer", "output", "output")
    expect(port?.typeLabel).toBe("object")
  })

  it("validates and refuses connections", () => {
    const good = {
      source: "writer",
      target: "later",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(isValidDataConnection(manifest(), document, good)).toBe(true)
    expect(dataConnectionRefusal(manifest(), document, good)).toBeUndefined()

    const badType = {
      source: "writer",
      target: "count",
      sourceHandle: "output",
      targetHandle: "ms",
    }
    expect(isValidDataConnection(manifest(), document, badType)).toBe(false)
    expect(dataConnectionRefusal(manifest(), document, badType)).toMatch(/not compatible|produced before/)

    const backwards = {
      source: "later",
      target: "writer",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(dataConnectionRefusal(manifest(), document, backwards)).toContain("produced before")

    const self = {
      source: "writer",
      target: "writer",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(dataConnectionRefusal(manifest(), document, self)).toContain("own output")

    const missingHandle = {
      source: "writer",
      target: "later",
      sourceHandle: FLOW_IN_HANDLE,
      targetHandle: "value",
    }
    expect(isValidDataConnection(manifest(), document, missingHandle)).toBe(false)
  })
})