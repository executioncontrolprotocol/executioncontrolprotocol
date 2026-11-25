import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  connectInput,
  insertConnectedStep,
} from "../../src/graph/connection-edit.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { END_RESULTS_HANDLE, LOOP_ITEM_HANDLE, LOOP_REF_HANDLE, loopEndNodeId } from "../../src/graph/types.js"
import { longestMatchingPortId, OUTPUT_HANDLE_ID } from "../../src/graph/extract-data-edges.js"
import type { ReactFlowPort } from "../../src/graph/types.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")
const schemaPath = path.resolve(here, "../../../../packages/protocol/schemas/execution.base.schema.json")

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")))

function load(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
}

const echo = "@executioncontrolprotocol/test.echo"
const bounded = "@executioncontrolprotocol/test.bounded"

function twoStep(): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      { id: "writer", uses: bounded, input: { text: "hello" }, as: "writer" },
      { id: "later", uses: bounded, as: "later" },
    ],
  }
}

describe("connectInput", () => {
  it("writes nested paths and replaces literals", () => {
    const base = twoStep()
    const before = structuredClone(base)
    const nested: ExecutionManifest = {
      ...base,
      steps: [
        base.steps[0]!,
        { id: "later", uses: bounded, input: { payload: { note: "keep" } }, as: "later" },
      ],
    }
    const result = connectInput(nested, {
      sourceNodeId: "writer",
      sourceHandle: "text",
      targetStepId: "later",
      targetHandle: "text",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validate(result.manifest)).toBe(true)
    expect(before).toEqual(base)
    const later = result.manifest.steps[1] as { input?: { text?: { $ref?: string } } }
    expect(later.input?.text).toEqual({ $ref: "state.writer.text" })

    const payload = connectInput(nested, {
      sourceNodeId: "writer",
      sourceHandle: "text",
      targetStepId: "later",
      targetHandle: "payload.text",
    })
    expect(payload.ok).toBe(true)
    if (!payload.ok) return
    const step = payload.manifest.steps[1] as {
      input?: { payload?: { text?: { $ref?: string }; note?: string } }
    }
    expect(step.input?.payload?.text).toEqual({ $ref: "state.writer.text" })
    expect(step.input?.payload?.note).toBe("keep")
  })

  it("uses accepts and loop sources", () => {
    const foreach = load("loop-foreach.ecp.json")
    const accepts = connectInput(foreach, {
      sourceNodeId: EXECUTION_ACCEPTS_NODE_ID,
      sourceHandle: "rowA",
      targetStepId: "echo",
      targetHandle: "value",
    })
    expect(accepts.ok).toBe(true)
    const item = connectInput(foreach, {
      sourceNodeId: "rows",
      sourceHandle: LOOP_ITEM_HANDLE,
      targetStepId: "echo",
      targetHandle: "value",
    })
    expect(item.ok).toBe(true)
    const withTail: ExecutionManifest = {
      ...foreach,
      steps: [
        ...foreach.steps,
        { id: "after", uses: echo, input: { value: "t" }, as: "after" },
      ],
    }
    const into = connectInput(withTail, {
      sourceNodeId: loopEndNodeId("rows"),
      sourceHandle: END_RESULTS_HANDLE,
      targetStepId: "after",
      targetHandle: "value",
    })
    expect(into.ok).toBe(true)
    if (into.ok) {
      const after = into.manifest.steps.find((node) => node.id === "after") as {
        input?: { value?: { $ref?: string } }
      }
      expect(after?.input?.value).toEqual({ $ref: "state.results" })
    }
  })

  it("adds as when missing on the writer", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "writer", uses: bounded, input: { text: "x" } },
        { id: "later", uses: bounded, as: "later" },
      ],
    }
    const before = structuredClone(base)
    const result = connectInput(base, {
      sourceNodeId: "writer",
      sourceHandle: "text",
      targetStepId: "later",
      targetHandle: "text",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(before).toEqual(base)
    const writer = result.manifest.steps[0] as { as?: string }
    expect(writer.as).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
  })

  it("refuses loop item when the loop has no as key", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rows",
          mode: "forEach",
          into: "out",
          ref: "state.items",
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body" }],
        },
      ],
    }
    expect(
      connectInput(base, {
        sourceNodeId: "rows",
        sourceHandle: LOOP_ITEM_HANDLE,
        targetStepId: "body",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_HANDLE })
  })

  it("refuses self, order, and bad handles without mutating", () => {
    const base = twoStep()
    const before = structuredClone(base)
    expect(
      connectInput(base, {
        sourceNodeId: "writer",
        sourceHandle: "text",
        targetStepId: "writer",
        targetHandle: "text",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_SELF })
    expect(
      connectInput(base, {
        sourceNodeId: "later",
        sourceHandle: "text",
        targetStepId: "writer",
        targetHandle: "text",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_ORDER })
    expect(
      connectInput(base, {
        sourceNodeId: "writer",
        sourceHandle: "text",
        targetStepId: "later",
        targetHandle: LOOP_REF_HANDLE,
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_HANDLE })
    expect(base).toEqual(before)
  })

  it("longestMatchingPortId round-trips dotted handles", () => {
    expect(longestMatchingPortId("text", [OUTPUT_HANDLE_ID, "text"])).toBe("text")
    expect(longestMatchingPortId("doc.title", [OUTPUT_HANDLE_ID, "doc", "doc.title"])).toBe("doc.title")
  })

  it("writes output handle refs without a field suffix", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "writer", uses: echo, input: { value: "w" }, as: "writer" },
        { id: "later", uses: echo, as: "later" },
      ],
    }
    const result = connectInput(base, {
      sourceNodeId: "writer",
      sourceHandle: "output",
      targetStepId: "later",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const later = result.manifest.steps[1] as { input?: { value?: { $ref?: string } } }
    expect(later.input?.value).toEqual({ $ref: "state.writer" })
  })
})

describe("insertConnectedStep", () => {
  const stringPort: ReactFlowPort = { id: "text", name: "text", typeLabel: "string" }

  it("wires echo after string output origin", () => {
    const base = twoStep()
    const before = structuredClone(base)
    const result = insertConnectedStep(
      base,
      { id: echo, accepts: { type: "object", properties: { value: { type: "string" } } } },
      { nodeId: "writer", handleId: "text", side: "output" },
      stringPort,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(before).toEqual(base)
    const ids = result.manifest.steps.map((step) => step.id)
    expect(ids.indexOf("echo")).toBeGreaterThan(ids.indexOf("writer"))
    const echoStep = result.manifest.steps.find((step) => step.id === "echo") as {
      input?: { value?: { $ref?: string } }
    }
    expect(echoStep.input?.value).toEqual({ $ref: "state.writer.text" })
  })

  it("wires from input origin before the new step", () => {
    const base = twoStep()
    const result = insertConnectedStep(
      base,
      { id: echo, returns: { type: "object", properties: { value: { type: "string" } } } },
      { nodeId: "later", handleId: "text", side: "input" },
      { id: "text", name: "text", typeLabel: "string!" },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.manifest.steps.map((step) => step.id)
    expect(ids.indexOf("echo")).toBeLessThan(ids.indexOf("later"))
  })

  it("inserts unwired when no port matches", () => {
    const base = twoStep()
    const result = insertConnectedStep(
      base,
      {
        id: "@executioncontrolprotocol/test.delay",
        accepts: { type: "object", properties: { ms: { type: "integer" } }, required: ["ms"] },
      },
      { nodeId: "writer", handleId: "text", side: "output" },
      stringPort,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const delay = result.manifest.steps.find((step) => step.uses?.includes("delay"))
    expect(delay?.input).toBeUndefined()
  })
})