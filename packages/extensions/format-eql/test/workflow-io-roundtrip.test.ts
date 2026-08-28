import { describe, expect, it } from "vitest"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import { decodePatch, decodeWorkflow, encodePatch, encodeWorkflow } from "./helpers.js"

const ACCEPTS_RETURNS_MANIFEST: WorkflowManifest = {
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: {
    id: "echo-from-input",
    label: "Echo from input",
    accepts: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    },
    returns: {
      type: "object",
      properties: { echo: { type: "object" } },
      required: ["echo"],
    },
  },
  steps: [
    {
      type: "step",
      id: "echo",
      uses: "@executioncontrolprotocol/test.echo",
      input: { value: { $ref: "state.value" } },
      as: "echo",
    },
  ],
}

describe("workflow accepts/returns EQL round-trip", () => {
  it("encodes and decodes ACCEPTS/RETURNS blocks", () => {
    const encoded = encodeWorkflow(ACCEPTS_RETURNS_MANIFEST, { headers: false })
    expect(encoded.success).toBe(true)
    const text = encoded.result as string
    expect(text).toContain("ACCEPTS")
    expect(text).toContain("WITH value:string!")
    expect(text).toContain("RETURNS")
    expect(text).toContain("OUT echo:object!")
    expect(text).toContain("WITH value = REF value")

    const decoded = decodeWorkflow(text)
    expect(decoded.success).toBe(true)
    expect(decoded.result).toEqual(ACCEPTS_RETURNS_MANIFEST)
  })

  it("rejects WITH assignments inside ACCEPTS", () => {
    const text = `WORKFLOW bad-io
ACCEPTS
  WITH value = REF value
STEP echo USES @executioncontrolprotocol/test.echo`
    const decoded = decodeWorkflow(text)
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics.some((i) => i.message.includes("not allowed in ACCEPTS"))).toBe(
      true
    )
  })

  it("encodes and decodes patch UPDATE WORKFLOW accepts", () => {
    const patch = {
      schema: "@executioncontrolprotocol.patch",
      version: "1.0",
      targetSchema: "@executioncontrolprotocol.workflow",
      patches: [
        { path: "workflow.id", mode: "replace" as const, value: "echo-test" },
        {
          path: "workflow.accepts",
          mode: "replace" as const,
          value: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
        },
      ],
    }
    const encoded = encodePatch(patch, { headers: false })
    expect(encoded.success).toBe(true)
    const text = encoded.result as string
    expect(text).toContain("UPDATE WORKFLOW")
    expect(text).toContain("ACCEPTS")
    expect(text).toContain("WITH value:string!")

    const decoded = decodePatch(text)
    expect(decoded.success).toBe(true)
    const acceptsPatch = (decoded.result as typeof patch).patches.find(
      (p) => p.path === "workflow.accepts"
    )
    expect(acceptsPatch?.value).toEqual(patch.patches[1]!.value)
  })
})
