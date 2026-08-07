import { describe, expect, it } from "vitest"
import {
  selectBestWorkflowEqlBlock,
  takeFirstWorkflowEqlBlock,
} from "../../src/harness/authoring/normalize-create-eql-output.js"

describe("takeFirstWorkflowEqlBlock", () => {
  it("keeps only the first WORKFLOW block", () => {
    const raw = [
      'WORKFLOW echo-summarize "Echo summarize"',
      "STEP echo USES @executioncontrolprotocol/test.echo",
      'WORKFLOW echo-notify "Echo and notify"',
      "STEP notify USES @executioncontrolprotocol/test.notify",
    ].join("\n")
    const trimmed = takeFirstWorkflowEqlBlock(raw)
    expect(trimmed).toContain("echo-summarize")
    expect(trimmed).not.toContain("echo-notify")
  })
})

describe("selectBestWorkflowEqlBlock", () => {
  it("picks the block that matches required capabilities", () => {
    const raw = [
      'WORKFLOW two-step-translate "Echo translate"',
      "STEP echo USES @executioncontrolprotocol/test.echo",
      "STEP translate USES @executioncontrolprotocol/test.translate",
      'WORKFLOW echo-summarize "Echo summarize"',
      "STEP echo USES @executioncontrolprotocol/test.echo",
      "STEP summarize USES @executioncontrolprotocol/test.summarize",
    ].join("\n")
    const best = selectBestWorkflowEqlBlock(raw, [
      "@executioncontrolprotocol/test.echo",
      "@executioncontrolprotocol/test.summarize",
    ])
    expect(best).toContain("echo-summarize")
    expect(best).not.toContain("translate")
  })
})

describe("filterWorkflowEqlToRequiredCapabilities", () => {
  it("removes extra STEP blocks when all required capabilities are present", async () => {
    const { filterWorkflowEqlToRequiredCapabilities } = await import(
      "../../src/harness/authoring/normalize-create-eql-output.js"
    )
    const raw = [
      'WORKFLOW echo-workflow "Echo workflow"',
      "STEP echo USES @executioncontrolprotocol/test.echo",
      "  LABEL \"Echo\"",
      "  AS echo",
      "STEP generate USES @executioncontrolprotocol/test.generate",
      "  LABEL \"Generate\"",
      "  AS generate",
      "STEP summarize USES @executioncontrolprotocol/test.summarize",
      "  LABEL \"Summarize\"",
      "  AS summarize",
    ].join("\n")
    const filtered = filterWorkflowEqlToRequiredCapabilities(raw, [
      "@executioncontrolprotocol/test.echo",
      "@executioncontrolprotocol/test.summarize",
    ])
    expect((filtered.match(/^STEP /gm) ?? []).length).toBe(2)
    expect(filtered).not.toContain("demo.generate")
  })

  it("preserves same USES with distinct step ids", async () => {
    const { filterWorkflowEqlToRequiredCapabilities } = await import(
      "../../src/harness/authoring/normalize-create-eql-output.js"
    )
    const cap = "@executioncontrolprotocol/chrome-ai.generate"
    const raw = [
      'WORKFLOW poem-summarize "Poem Summarization"',
      `STEP poem USES ${cap}`,
      '  LABEL "Generate Poem"',
      "  AS poem",
      `STEP summarize USES ${cap}`,
      '  LABEL "Summarize Poem"',
      "  WITH context = REF poem.text",
      "  AS summary",
    ].join("\n")
    const filtered = filterWorkflowEqlToRequiredCapabilities(raw, [cap])
    expect((filtered.match(/^STEP /gm) ?? []).length).toBe(2)
    expect(filtered).toContain("STEP poem USES")
    expect(filtered).toContain("STEP summarize USES")
  })
})

describe("deduplicateWorkflowEqlStepIds", () => {
  it("renames duplicate generate ids using AS aliases", async () => {
    const { deduplicateWorkflowEqlStepIds } = await import(
      "../../src/harness/authoring/normalize-create-eql-output.js"
    )
    const cap = "@executioncontrolprotocol/chrome-ai.generate"
    const raw = [
      'WORKFLOW email-action "Email Action"',
      `STEP generate USES ${cap}`,
      '  LABEL "Generate Email"',
      '  WITH prompt = "Write email"',
      "  AS email",
      `STEP generate USES ${cap}`,
      '  LABEL "Extract Action Items"',
      '  WITH prompt = "Extract actions"',
      "  AS actions",
    ].join("\n")
    const fixed = deduplicateWorkflowEqlStepIds(raw)
    expect(fixed).toContain("STEP email USES")
    expect(fixed).toContain("STEP actions USES")
    expect((fixed.match(/^STEP generate /gm) ?? []).length).toBe(0)
  })

  it("updates REF paths when renaming duplicate step ids", async () => {
    const { deduplicateWorkflowEqlStepIds } = await import(
      "../../src/harness/authoring/normalize-create-eql-output.js"
    )
    const cap = "@executioncontrolprotocol/chrome-ai.generate"
    const raw = [
      'WORKFLOW poem-summarize "Poem"',
      `STEP generate USES ${cap}`,
      "  AS poem",
      `STEP generate USES ${cap}`,
      "  WITH context = REF generate.text",
      "  AS summary",
    ].join("\n")
    const fixed = deduplicateWorkflowEqlStepIds(raw)
    expect(fixed).toContain("STEP poem USES")
    expect(fixed).toContain("REF poem.text")
    expect(fixed).not.toContain("REF generate.")
  })
})
