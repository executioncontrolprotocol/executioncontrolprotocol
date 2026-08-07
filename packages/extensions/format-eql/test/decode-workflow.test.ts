import { describe, expect, it } from "vitest"
import type { StepNode, WorkflowManifest } from "@executioncontrolprotocol/types"
import { decodeWorkflow, encodeWorkflow, loadWorkflowFixture } from "./helpers.js"

describe("decode workflow from EQL", () => {
  it("parses encoded workflow into a valid manifest", () => {
    const manifest = loadWorkflowFixture("echo-workflow")
    const encoded = encodeWorkflow(manifest)
    expect(encoded.success).toBe(true)

    const decoded = decodeWorkflow(encoded.result!)
    expect(decoded.success).toBe(true)
    expect(decoded.result).toEqual(manifest)
  })

  it("returns line diagnostics for invalid syntax", () => {
    const decoded = decodeWorkflow("WORKFLOW broken\nSTEP x")
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics.some((d) => d.path?.startsWith("line:"))).toBe(true)
    expect(decoded.diagnostics.some((d) => d.code === "EQL_SYNTAX")).toBe(true)
  })

  it("rejects flow-control keywords in v1", () => {
    const text = `ECP @executioncontrolprotocol.workflow 1.0
WORKFLOW flow
PARALLEL p
  STEP a USES @executioncontrolprotocol/test.echo
END`
    const decoded = decodeWorkflow(text)
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics.some((d) => d.code === "EQL_UNSUPPORTED_NODE")).toBe(true)
  })

  it("round-trips REF, STATE, and WHEN", () => {
    const manifest = loadWorkflowFixture("ref-state-workflow")
    const encoded = encodeWorkflow(manifest)
    const decoded = decodeWorkflow(encoded.result!)
    expect(decoded.success).toBe(true)
    const step = (decoded.result as WorkflowManifest).steps[0] as StepNode
    expect(step.input?.context).toEqual({ $ref: "state.signals.results" })
    expect(step.input?.brief).toEqual({ $state: "creativeInputs" })
    expect(step.when).toEqual({ eq: ["state.approved", false] })
  })
})
