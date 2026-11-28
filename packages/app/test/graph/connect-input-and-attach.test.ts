import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  CONNECTION_EDIT_NOT_STEP,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SOURCE_DETACHED,
  connectInput,
  connectInputAndAttach,
  placementManifestForDetachedConnect,
} from "../../src/graph/connection-edit.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { LOOP_COUNT_HANDLE, LOOP_ITEM_HANDLE, LOOP_ITEMS_HANDLE, endMarkerId } from "../../src/graph/types.js"

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

describe("connectInputAndAttach", () => {
  it("places a detached root after the source, binds input, and clears detached", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: echo, as: "C" }],
    }
    const snapshot = structuredClone(before)
    const result = connectInputAndAttach(before, {
      sourceNodeId: "A",
      sourceHandle: "output",
      targetStepId: "C",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validate(result.manifest)).toBe(true)
    expect(result.manifest.detached).toBeUndefined()
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["A", "C"])
    const c = result.manifest.steps[1] as { input?: { value?: { $ref?: string } } }
    expect(c.input?.value).toEqual({ $ref: "state.A" })
    expect(before).toEqual(snapshot)
  })

  it("leaves other detached roots when one is reconnected", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [
        { id: "C", uses: echo, as: "C" },
        { id: "D", uses: echo, as: "D" },
      ],
    }
    const result = connectInputAndAttach(before, {
      sourceNodeId: "A",
      sourceHandle: "output",
      targetStepId: "C",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.detached?.map((node) => node.id)).toEqual(["D"])
  })

  it("prepends when the source is Inputs", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: { accepts: { type: "object", properties: { seed: { type: "string" } } } },
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [{ id: "C", uses: echo, as: "C" }],
    }
    const result = connectInputAndAttach(before, {
      sourceNodeId: EXECUTION_ACCEPTS_NODE_ID,
      sourceHandle: "seed",
      targetStepId: "C",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.steps.map((node) => node.id)).toEqual(["C", "A"])
    const c = result.manifest.steps[0] as { input?: { value?: { $ref?: string } } }
    expect(c.input?.value).toEqual({ $ref: "state.seed" })
  })

  it("inserts at the start of a loop body when the source handle is item", () => {
    const base = load("loop-foreach.ecp.json")
    const loopId = base.steps.find((node) => node.type === "loop")?.id ?? "rows"
    const before: ExecutionManifest = {
      ...base,
      detached: [{ id: "C", uses: echo, as: "C" }],
    }
    const result = connectInputAndAttach(before, {
      sourceNodeId: loopId,
      sourceHandle: LOOP_ITEM_HANDLE,
      targetStepId: "C",
      targetHandle: "value",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const loop = result.manifest.steps.find((node) => node.id === loopId)
    expect(loop?.type).toBe("loop")
    if (loop?.type === "loop") expect(loop.steps.map((node) => node.id)[0]).toBe("C")
    const c = loop?.type === "loop" ? (loop.steps[0] as { input?: { value?: { $ref?: string } } }) : undefined
    expect(c?.input?.value).toEqual({ $ref: "state.row" })
  })

  it("places a detached step after the loop when dragging from the end node shell", () => {
    const base: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rows",
          mode: "forEach",
          as: "row",
          input: { items: { $ref: "state.items" } },
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body" }],
        },
      ],
      detached: [{ id: "C", uses: echo, as: "C" }],
    }
    const placed = placementManifestForDetachedConnect(base, endMarkerId("rows", "loop"), "results", "C")
    expect(placed?.steps.map((node) => node.id)).toEqual(["rows", "C"])
    expect(
      connectInputAndAttach(base, {
        sourceNodeId: endMarkerId("rows", "loop"),
        sourceHandle: "results",
        targetStepId: "C",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false })
  })

  it("refuses nested detached steps, detached structures, and detached sources without mutating", () => {
    const nested: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [
        {
          type: "if",
          id: "wrap",
          expression: "true",
          then: [{ id: "inner", uses: echo, as: "inner" }],
        },
      ],
    }
    const snapshot = structuredClone(nested)
    expect(
      connectInputAndAttach(nested, {
        sourceNodeId: "A",
        sourceHandle: "output",
        targetStepId: "inner",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_STEP })

    const structureDetached: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [
        {
          type: "if",
          id: "b",
          expression: "true",
          then: [{ id: "s", uses: echo, as: "s" }],
        },
      ],
    }
    expect(
      connectInputAndAttach(structureDetached, {
        sourceNodeId: "A",
        sourceHandle: "output",
        targetStepId: "b",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_NOT_STEP })

    const sourceDetached: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
      detached: [
        { id: "C", uses: echo, as: "C" },
        { id: "D", uses: echo, as: "D" },
      ],
    }
    expect(
      connectInputAndAttach(sourceDetached, {
        sourceNodeId: "C",
        sourceHandle: "output",
        targetStepId: "D",
        targetHandle: "value",
      }),
    ).toMatchObject({ ok: false, reason: CONNECTION_EDIT_SOURCE_DETACHED })

    expect(nested).toEqual(snapshot)
    expect(sourceDetached.detached?.[0]?.id).toBe("C")
  })

  it("discards placement when scope rejects a loop ref source", () => {
    const base = load("loop-foreach.ecp.json")
    const loopId = base.steps.find((node) => node.type === "loop")?.id ?? "rows"
    const before: ExecutionManifest = {
      ...base,
      detached: [{ id: "late", uses: echo, as: "late" }],
    }
    const snapshot = structuredClone(before)
    const result = connectInputAndAttach(before, {
      sourceNodeId: loopId,
      sourceHandle: LOOP_ITEMS_HANDLE,
      targetStepId: "late",
      targetHandle: "value",
    })
    expect(result).toMatchObject({ ok: false, reason: CONNECTION_EDIT_ORDER })
    expect(before).toEqual(snapshot)
  })

  it("delegates to connectInput when the target is already in the flow", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "writer", uses: echo, input: { value: "w" }, as: "writer" },
        { id: "later", uses: echo, as: "later" },
      ],
    }
    const direct = connectInput(before, {
      sourceNodeId: "writer",
      sourceHandle: "output",
      targetStepId: "later",
      targetHandle: "value",
    })
    const composed = connectInputAndAttach(before, {
      sourceNodeId: "writer",
      sourceHandle: "output",
      targetStepId: "later",
      targetHandle: "value",
    })
    expect(composed).toEqual(direct)

    expect(
      connectInputAndAttach(before, {
        sourceNodeId: "later",
        sourceHandle: "output",
        targetStepId: "writer",
        targetHandle: "value",
      }),
    ).toEqual(
      connectInput(before, {
        sourceNodeId: "later",
        sourceHandle: "output",
        targetStepId: "writer",
        targetHandle: "value",
      }),
    )
  })

  it("connects in place when the target is an attached if or loop driver", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "A", uses: echo, input: { value: "a" }, as: "A" },
        { type: "if", id: "gate", expression: "true", then: [{ id: "T", uses: echo, input: { value: "t" } }] },
        {
          type: "loop",
          id: "lp",
          mode: "for",
          as: "i",
          input: { count: 2 },
          steps: [{ id: "B", uses: echo, input: { value: "b" }, as: "B", mode: "replace" }],
        },
      ],
    }
    const intoIf = connectInputAndAttach(before, {
      sourceNodeId: "A",
      sourceHandle: "output",
      targetStepId: "gate",
      targetHandle: "note",
    })
    expect(intoIf.ok).toBe(true)
    if (!intoIf.ok) return
    expect((intoIf.manifest.steps[1] as { input?: unknown }).input).toEqual({ note: { $ref: "state.A" } })

    const intoDriver = connectInputAndAttach(before, {
      sourceNodeId: "A",
      sourceHandle: "output",
      targetStepId: "lp",
      targetHandle: LOOP_COUNT_HANDLE,
    })
    expect(intoDriver.ok).toBe(true)
    if (!intoDriver.ok) return
    expect((intoDriver.manifest.steps[2] as { input?: { count?: { $ref?: string } } }).input?.count).toEqual({
      $ref: "state.A",
    })
  })

  it("refuses an unknown target that is neither attached nor a detached root", () => {
    const before: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "A", uses: echo, input: { value: "a" }, as: "A" }],
    }
    const result = connectInputAndAttach(before, {
      sourceNodeId: "A",
      sourceHandle: "output",
      targetStepId: "missing",
      targetHandle: "value",
    })
    expect(result).toEqual({ ok: false, reason: CONNECTION_EDIT_NOT_STEP })
  })
})
