import { describe, expect, it } from "vitest"
import type { JsonSchema } from "@executioncontrolprotocol/protocol"
import { validateCapabilityInput } from "../../src/plugins/validate-input.js"

const objectSchema: JsonSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
}

describe("validateCapabilityInput", () => {
  it("accepts input that matches the accepts schema", () => {
    expect(() => validateCapabilityInput(objectSchema, { name: "ok" })).not.toThrow()
    expect(() => validateCapabilityInput(objectSchema, { name: "again" })).not.toThrow()
    expect(() => validateCapabilityInput(objectSchema, { name: "cached" })).not.toThrow()
  })

  it("throws ECP_INPUT_INVALID with a path for bad input", () => {
    try {
      validateCapabilityInput(objectSchema, { name: 1 })
      expect.fail("expected throw")
    } catch (error) {
      expect(error).toMatchObject({ code: "ECP_INPUT_INVALID" })
      expect((error as Error).message).toContain("ECP_INPUT_INVALID")
    }
  })

  it("throws when required properties are missing", () => {
    expect(() => validateCapabilityInput(objectSchema, {})).toThrowError(/ECP_INPUT_INVALID/)
  })
})