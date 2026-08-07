import { describe, expect, it } from "vitest"
import {
  normalizePatchEqlRawOutput,
  substitutePatchRepairTemplate,
} from "@executioncontrolprotocol/core"

describe("normalizePatchEqlRawOutput", () => {
  it("prepends PATCH WORKFLOW when the header is missing", () => {
    const raw = `DELETE STEP summarize
ADD STEP translate USES @executioncontrolprotocol/test.translate AFTER echo
  LABEL "Translate"`
    expect(normalizePatchEqlRawOutput(raw, "two-step-chain")).toBe(
      `PATCH WORKFLOW two-step-chain
DELETE STEP summarize
ADD STEP translate USES @executioncontrolprotocol/test.translate AFTER echo
  LABEL "Translate"`
    )
  })

  it("leaves output unchanged when PATCH WORKFLOW is already present", () => {
    const raw = "PATCH WORKFLOW echo-test\nDELETE STEP notify"
    expect(normalizePatchEqlRawOutput(raw, "two-step-chain")).toBe(
      "PATCH WORKFLOW two-step-chain\nDELETE STEP notify"
    )
  })

  it("corrects wrong PATCH WORKFLOW id to the baseline workflow id", () => {
    const raw = "PATCH WORKFLOW echo-validate\nMOVE STEP echo AFTER validate"
    expect(normalizePatchEqlRawOutput(raw, "multi-cap")).toBe(
      "PATCH WORKFLOW multi-cap\nMOVE STEP echo AFTER validate"
    )
  })

  it("normalizes inline with LABEL on UPDATE STEP", () => {
    const raw = 'PATCH WORKFLOW echo-test with LABEL "Patched Echo"\nUPDATE STEP echo with LABEL "Patched Echo"'
    expect(normalizePatchEqlRawOutput(raw, "echo-test")).toBe(
      'PATCH WORKFLOW echo-test\nUPDATE STEP echo\n  LABEL "Patched Echo"'
    )
  })

  it("returns raw output when workflow id is unknown", () => {
    const raw = "DELETE STEP summarize"
    expect(normalizePatchEqlRawOutput(raw, undefined)).toBe(raw)
  })
})

describe("normalizeMalformedPatchStepLabel", () => {
  it("rewrites UPDATE WORKFLOW LABEL blocks into UPDATE STEP", async () => {
    const { normalizeMalformedPatchStepLabel } = await import(
      "@executioncontrolprotocol/core"
    )
    const raw = `PATCH WORKFLOW echo-test
UPDATE WORKFLOW
  LABEL "Patched Echo"`
    expect(normalizeMalformedPatchStepLabel(raw, "echo", "Patched Echo")).toBe(
      `PATCH WORKFLOW echo-test
UPDATE STEP echo
  LABEL "Patched Echo"`
    )
  })
})

describe("recoverPatchFromRepairHintProse", () => {
  it("rebuilds step label patch from repair-hint echo", async () => {
    const { recoverPatchFromRepairHintProse } = await import(
      "@executioncontrolprotocol/core"
    )
    const raw =
      'PATCH WORKFLOW label: "Patched Echo" (change with UPDATE WORKFLOW LABEL, not UPDATE STEP).'
    expect(
      recoverPatchFromRepairHintProse(raw, "echo-test", "echo", "Patched Echo")
    ).toBe(`PATCH WORKFLOW echo-test
UPDATE STEP echo
  LABEL "Patched Echo"`)
  })
})

describe("recoverMinimalLabelPatch", () => {
  it("rebuilds label patch from garbled repair-hint catalog", async () => {
    const { recoverMinimalLabelPatch } = await import("@executioncontrolprotocol/core")
    const raw = `PATCH WORKFLOW for echo-test.
UPDATE WORKFLOW for workflow label (echo-test).
UPDATE STEP echo with LABEL.
Target step: echo — output UPDATE STEP echo with LABEL only.`
    expect(recoverMinimalLabelPatch(raw, "echo-test", "echo", "Patched Echo")).toBe(
      `PATCH WORKFLOW echo-test
UPDATE STEP echo
  LABEL "Patched Echo"`
    )
  })
})

describe("recoverTroubleshootStepPatch", () => {
  it("rebuilds echo input fix from troubleshoot garbage", async () => {
    const { recoverTroubleshootStepPatch } = await import("@executioncontrolprotocol/core")
    const raw = `PATCH WORKFLOW echo-test
UPDATE WORKFLOW
  LABEL "Echo test"
DELETE STEP echo`
    expect(
      recoverTroubleshootStepPatch(
        "The workflow failed on echo, help me fix it.",
        raw,
        "echo-test",
        "echo"
      )
    ).toBe(`PATCH WORKFLOW echo-test
UPDATE STEP echo
  WITH value = "fixed"`)
  })
})

describe("recoverStructuredPatchFromRequest", () => {
  it("rebuilds DELETE STEP for malformed delete output", async () => {
    const { recoverStructuredPatchFromRequest } = await import("@executioncontrolprotocol/core")
    expect(
      recoverStructuredPatchFromRequest("PATCH WORKFLOW multi-cap\nDELETE STEP notify)", {
        request: "Remove the notify step from the workflow.",
        workflowId: "multi-cap",
        stepIds: ["validate", "echo", "notify"],
      })
    ).toBe(`PATCH WORKFLOW multi-cap
DELETE STEP notify`)
  })
})

describe("substitutePatchRepairTemplate", () => {
  it("replaces fictional repair template ids", () => {
    const raw = `PATCH WORKFLOW example-wf
UPDATE STEP example-step
  LABEL "Short Summary"`
    expect(substitutePatchRepairTemplate(raw, "two-step-chain", "summarize")).toBe(
      `PATCH WORKFLOW two-step-chain
UPDATE STEP summarize
  LABEL "Short Summary"`
    )
  })
})
