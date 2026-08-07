import { describe, expect, it } from "vitest"
import { normalizeIntentEqlRawOutput } from "../../src/harness/authoring/normalize-intent-eql-output.js"

describe("normalizeIntentEqlRawOutput", () => {
  it("fixes INTIntent typos", () => {
    expect(normalizeIntentEqlRawOutput("INTIntent workflow-patch)")).toBe("INTENT workflow-patch")
    expect(normalizeIntentEqlRawOutput("INTIntent faq")).toBe("INTENT faq")
    expect(
      normalizeIntentEqlRawOutput(
        'INTIntent workflow-patch TOPIC echo-failure SUMMARY "User reports failure"'
      )
    ).toBe('INTENT workflow-patch TOPIC echo-failure SUMMARY "User reports failure"')
  })

  it("fixes bare faq token", () => {
    expect(normalizeIntentEqlRawOutput("FAQ)")).toBe("INTENT faq")
  })

  it("normalizes TOPIC and SUMMARY on intent line", () => {
    expect(
      normalizeIntentEqlRawOutput(
        'INTENT faq TOPIC patching SUMMARY User asks how patching works'
      )
    ).toBe('INTENT faq TOPIC patching SUMMARY "User asks how patching works"')
  })
})
