import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { applyDataEdgeDraft, dataEdgeEditable } from "../../src/graph/edge-panel-logic.js"

describe("applyDataEdgeDraft", () => {
  it("does not write a ref-only binding", () => {
    const refManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "step", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.x" } } }],
    }
    expect(applyDataEdgeDraft(refManifest, "step", { kind: "data", inputPath: "value", statePath: "x" }, "nope")).toBeUndefined()
  })

  it("does not write $expr bindings from the edge panel", () => {
    const exprManifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "step", uses: "@executioncontrolprotocol/test.echo", input: { value: { $expr: "state.x" } } }],
    }
    expect(
      applyDataEdgeDraft(exprManifest, "step", { kind: "data", inputPath: "value", statePath: "x" }, "other"),
    ).toBeUndefined()
  })
})

describe("dataEdgeEditable", () => {
  it("is always false on the graph model", () => {
    expect(dataEdgeEditable({ manifestPointer: "/x", validatePointer: "/x/$expr", markerKind: "expr" })).toBe(false)
    expect(dataEdgeEditable({ manifestPointer: "/x", validatePointer: "/x", markerKind: "ref", refPath: "state.x" })).toBe(false)
    expect(dataEdgeEditable(undefined)).toBe(false)
  })
})