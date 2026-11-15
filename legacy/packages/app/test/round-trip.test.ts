import { describe, expect, it } from "vitest"
import { canRoundTrip } from "../src/host/round-trip.js"

const ENCODER_WRITTEN = `import {
  workflow,
  step,
} from "@executioncontrolprotocol/core";

export default workflow("Echo")
  .id("echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello" })
      .as("echo"),
  ]);
`

describe("canRoundTrip", () => {
  it("accepts encoder-written fluent files", () => {
    expect(canRoundTrip(ENCODER_WRITTEN)).toEqual({ ok: true, reasons: [] })
  })

  it("rejects relative imports", () => {
    const source = `import { helper } from "./lib.js"\n${ENCODER_WRITTEN}`
    const result = canRoundTrip(source)
    expect(result.ok).toBe(false)
    expect(result.reasons.some((reason) => reason.includes("Relative imports"))).toBe(true)
  })

  it("rejects computed .with() values", () => {
    const source = ENCODER_WRITTEN.replace(
      ".with({ value: \"hello\" })",
      ".with(buildInput())"
    )
    const result = canRoundTrip(source)
    expect(result.ok).toBe(false)
    expect(result.reasons.some((reason) => reason.includes("Computed"))).toBe(true)
  })

  it("rejects non-core package imports", () => {
    const source = `import { foo } from "@other/pkg"\n${ENCODER_WRITTEN}`
    const result = canRoundTrip(source)
    expect(result.ok).toBe(false)
    expect(result.reasons.some((reason) => reason.includes("@other/pkg"))).toBe(true)
  })

  it("does not treat comments as read-only", () => {
    const source = `// hand-written note\n${ENCODER_WRITTEN}`
    expect(canRoundTrip(source).ok).toBe(true)
  })
})
