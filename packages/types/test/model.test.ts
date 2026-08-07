import { describe, expect, it } from "vitest"
import { modelGenerateInputSchema } from "../src/model.js"

describe("modelGenerateInputSchema", () => {
  it("requires prompt", () => {
    const result = modelGenerateInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it("accepts prompt only", () => {
    const result = modelGenerateInputSchema.safeParse({ prompt: "hello" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.prompt).toBe("hello")
    }
  })

  it("accepts all optional fields", () => {
    const result = modelGenerateInputSchema.safeParse({
      prompt: "hello",
      system: "be brief",
      model: "gpt-4o-mini",
      context: { prior: "output" },
      responseFormat: "eql",
      options: { temperature: 0.1 },
    })
    expect(result.success).toBe(true)
  })
})
