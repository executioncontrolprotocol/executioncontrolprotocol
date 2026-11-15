import { describe, expect, it } from "vitest"
import { z } from "zod"
import { secrets } from "../src/index.js"
import {
  substituteConfigPlaceholders,
  validateBoundConfig,
} from "../src/environment/validate-binding-config.js"
import { ECP_BINDING_INVALID, EcpError } from "../src/types/index.js"

describe("binding config validation", () => {
  const schema = z.object({
    apiKey: z.string(),
    model: z.string().optional(),
  })

  it("treats $secret placeholders as strings before resolution", () => {
    expect(() =>
      validateBoundConfig(
        schema,
        { apiKey: secrets("openai/api-key") },
        "@executioncontrolprotocol/openai",
        "placeholder"
      )
    ).not.toThrow()
  })

  it("rejects resolved values that fail the schema", () => {
    expect(() =>
      validateBoundConfig(
        schema,
        { apiKey: 1 },
        "@executioncontrolprotocol/openai",
        "resolved"
      )
    ).toThrow(EcpError)
    try {
      validateBoundConfig(schema, { apiKey: 1 }, "@executioncontrolprotocol/openai", "resolved")
    } catch (err) {
      expect((err as EcpError).code).toBe(ECP_BINDING_INVALID)
    }
  })

  it("substitutes nested placeholders", () => {
    const out = substituteConfigPlaceholders({
      nested: { token: secrets("x") },
    }) as { nested: { token: string } }
    expect(out.nested.token).toBe("")
  })
})
