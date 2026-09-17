import { describe, expect, it } from "vitest"
import { buildCodingIntentRoutingLines } from "../src/intent-classification-coding.js"

describe("buildCodingIntentRoutingLines", () => {
  it("includes hasProbeContext when probe options are live", () => {
    const lines = buildCodingIntentRoutingLines({
      message: "Pick layer-logo and complete the workflow.",
      hasProbeContext: true,
      hasBaselineWorkflow: false,
    })
    expect(lines.join("\n")).toContain("hasProbeContext=true")
    expect(lines.join("\n")).toContain("hasBaselineWorkflow=false")
    expect(lines.join("\n")).not.toContain("Environment capabilities")
  })

  it("omits probe hint when hasProbeContext is absent", () => {
    const lines = buildCodingIntentRoutingLines({
      message: "Create a new echo workflow.",
    })
    expect(lines.join("\n")).not.toContain("hasProbeContext")
  })
})
