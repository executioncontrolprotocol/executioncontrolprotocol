import { describe, expect, it } from "vitest"
import { validateCapabilityInput } from "../src/index.js"

describe("validateCapabilityInput", () => {
  it("accepts matching input and rejects mismatches", () => {
    const accepts = {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    }
    expect(() => validateCapabilityInput(accepts, { value: "ok" })).not.toThrow()
    expect(() => validateCapabilityInput(accepts, { value: 1 })).toThrow(/ECP_INPUT_INVALID/)
    expect(() => validateCapabilityInput(accepts, {})).toThrow(/ECP_INPUT_INVALID/)
  })
})
