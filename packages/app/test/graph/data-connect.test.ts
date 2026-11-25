import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { executionToReactFlow } from "../../src/graph/execution-to-reactflow.js"
import {
  CONNECTION_EDIT_NOT_STEP,
  CONNECTION_EDIT_SOURCE_DETACHED,
} from "../../src/graph/connection-edit.js"
import {
  dataConnectionRefusal,
  isDataHandle,
  connectInputTarget,
  isValidDataConnection,
  portOnDocument,
} from "../../src/graph/data-connect.js"
import { LOOP_REF_HANDLE } from "../../src/graph/types.js"

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
    expect(isDataHandle(null)).toBe(false)
    expect(isDataHandle(LOOP_REF_HANDLE)).toBe(true)
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
      sourceHandle: LOOP_REF_HANDLE,
      targetHandle: "value",
    }
    expect(isValidDataConnection(manifest(), document, missingHandle)).toBe(false)
  })

  it("accepts compatible drops onto detached root steps and refuses nested or detached sources", () => {
    const detachedManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "writer", uses: echo, input: { value: "w" }, as: "writer" }],
      detached: [{ id: "later", uses: echo, as: "later" }],
    }
    const detachedDoc = executionToReactFlow(detachedManifest, { capabilitySchemas: schemas })
    const ontoRoot = {
      source: "writer",
      target: "later",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(isValidDataConnection(detachedManifest, detachedDoc, ontoRoot)).toBe(true)
    expect(dataConnectionRefusal(detachedManifest, detachedDoc, ontoRoot)).toBeUndefined()

    const nestedDetached: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "writer", uses: echo, input: { value: "w" }, as: "writer" }],
      detached: [
        {
          type: "if",
          id: "wrap",
          expression: "true",
          then: [{ id: "inner", uses: echo, as: "inner" }],
        },
      ],
    }
    const nestedDoc = executionToReactFlow(nestedDetached, { capabilitySchemas: schemas })
    const ontoNested = {
      source: "writer",
      target: "inner",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(dataConnectionRefusal(nestedDetached, nestedDoc, ontoNested)).toBe(CONNECTION_EDIT_NOT_STEP)

    const sourceDetached: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "writer", uses: echo, input: { value: "w" }, as: "writer" }],
      detached: [
        { id: "lonely", uses: echo, as: "lonely" },
        { id: "also", uses: echo, as: "also" },
      ],
    }
    const sourceDoc = executionToReactFlow(sourceDetached, { capabilitySchemas: schemas })
    const fromDetached = {
      source: "lonely",
      target: "also",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(dataConnectionRefusal(sourceDetached, sourceDoc, fromDetached)).toBe(CONNECTION_EDIT_SOURCE_DETACHED)

    const backwards = {
      source: "later",
      target: "writer",
      sourceHandle: "output",
      targetHandle: "value",
    }
    expect(dataConnectionRefusal(manifest(), document, backwards)).toContain("produced before")

    const incompatible = {
      source: "writer",
      target: "count",
      sourceHandle: "output",
      targetHandle: "ms",
    }
    expect(isValidDataConnection(manifest(), document, incompatible)).toBe(false)
  })

  it("portOnDocument and refusal handle loop ports and missing fields", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "L",
          mode: "for",
          as: "i",
          count: 2,
          steps: [{ id: "body", uses: echo, as: "body" }],
          end: { input: { value: 0 } },
        },
      ],
    }
    const doc = executionToReactFlow(manifest, { capabilitySchemas: schemas })
    expect(portOnDocument(doc, "L", "index", "output")).toBeDefined()
    expect(portOnDocument(doc, "L", "index", "input")).toBeUndefined()
    expect(portOnDocument(doc, "missing", "x", "output")).toBeUndefined()
    expect(dataConnectionRefusal(manifest, doc, {})).toBeDefined()
    expect(connectInputTarget({ source: "body", target: "body", sourceHandle: "output", targetHandle: "value" })).toBeDefined()
  })
})