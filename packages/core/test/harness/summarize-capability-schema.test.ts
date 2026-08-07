import { describe, expect, it } from "vitest"
import { z } from "zod"
import { modelGenerateInputSchema } from "@executioncontrolprotocol/types"
import {
  allCapabilityInputNames,
  formatCapabilityInputLabels,
  introspectCapabilitySchema,
} from "../../src/harness/authoring/summarize-capability-schema.js"

describe("introspectCapabilitySchema", () => {
  it("classifies Zod object required and optional fields", () => {
    const fields = introspectCapabilitySchema(modelGenerateInputSchema)
    expect(fields.required).toEqual(["prompt"])
    expect(fields.optional).toEqual(
      expect.arrayContaining(["system", "model", "context", "responseFormat", "options"])
    )
    expect(fields.eqlTypes?.prompt).toBe("string!")
    expect(fields.eqlTypes?.system).toBe("string")
  })

  it("classifies JSON Schema required array", () => {
    const fields = introspectCapabilitySchema({
      type: "object",
      properties: {
        value: { type: "string" },
        label: { type: "string" },
      },
      required: ["value"],
    })
    expect(fields.required).toEqual(["value"])
    expect(fields.optional).toEqual(["label"])
  })

  it("classifies EQL type map with ! suffix", () => {
    const fields = introspectCapabilitySchema({
      prompt: "string!",
      system: "string",
    })
    expect(fields.required).toEqual(["prompt"])
    expect(fields.optional).toEqual(["system"])
  })

  it("formats labels for harness prompts", () => {
    const text = formatCapabilityInputLabels({
      required: ["prompt"],
      optional: ["system"],
    })
    expect(text).toBe("prompt (required), system (optional)")
  })

  it("orders all input names required first", () => {
    const names = allCapabilityInputNames({
      required: ["prompt"],
      optional: ["system", "model"],
    })
    expect(names).toEqual(["prompt", "system", "model"])
  })

  it("handles empty schema", () => {
    expect(introspectCapabilitySchema(undefined)).toEqual({ required: [], optional: [] })
  })

  it("handles local Zod schema", () => {
    const schema = z.object({
      value: z.string(),
      tag: z.string().optional(),
    })
    const fields = introspectCapabilitySchema(schema)
    expect(fields.required).toEqual(["value"])
    expect(fields.optional).toEqual(["tag"])
  })
})
