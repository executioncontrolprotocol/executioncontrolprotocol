import { describe, expect, it } from "vitest"
import { encodeWorkflowToEql } from "../src/encode/encode-workflow.js"
import { loadWorkflowFixture } from "./helpers.js"

describe("encode workflow to EQL", () => {
  it("emits header, workflow line, and steps", () => {
    const manifest = loadWorkflowFixture("echo-workflow")
    const text = encodeWorkflowToEql(manifest)
    expect(text).toContain("ECP @executioncontrolprotocol.workflow 1.0")
    expect(text).toContain('WORKFLOW echo-test "Echo test"')
    expect(text).toContain("STEP echo USES @executioncontrolprotocol/test.echo")
    expect(text).toContain("LABEL Echo")
    expect(text).toMatch(/WITH value = "hello from fluent API"/)
    expect(text).toContain("AS echo")
  })

  it("omits header when options.headers is false", () => {
    const manifest = loadWorkflowFixture("echo-workflow")
    const text = encodeWorkflowToEql(manifest, { headers: false }, false)
    expect(text).not.toContain("ECP @executioncontrolprotocol.workflow")
    expect(text.startsWith("WORKFLOW echo-test")).toBe(true)
  })

  it("formats REF and STATE in WITH clauses", () => {
    const manifest = loadWorkflowFixture("ref-state-workflow")
    const text = encodeWorkflowToEql(manifest)
    expect(text).toContain("WITH context = REF signals.results")
    expect(text).toContain("WITH brief = STATE creativeInputs")
    expect(text).toContain("WHEN approved == false")
  })

  it("preserves step order for multi-step workflows", () => {
    const manifest = loadWorkflowFixture("two-step-chain")
    const text = encodeWorkflowToEql(manifest)
    const echoIdx = text.indexOf("STEP echo")
    const summarizeIdx = text.indexOf("STEP summarize")
    expect(echoIdx).toBeGreaterThan(-1)
    expect(summarizeIdx).toBeGreaterThan(echoIdx)
    expect(text).toContain("WITH payload = REF echo.output")
  })
})
