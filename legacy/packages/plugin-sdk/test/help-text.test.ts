import { describe, expect, it } from "vitest"
import { descriptionFromMetadata, examplesFromFields } from "../src/help-text.js"
import { schemaFieldNames } from "../src/schema-fields.js"
import { z } from "zod"

describe("help text", () => {
  it("returns empty description without metadata", () => {
    expect(descriptionFromMetadata(undefined)).toBe("")
  })

  it("includes use cases and projections", () => {
    const text = descriptionFromMetadata({
      summary: "X",
      description: "Does X.",
      useCases: ["A"],
      projections: [{ summary: "Take y", description: "Y." }],
    })
    expect(text).toMatch(/Does X/)
    expect(text).toMatch(/Use cases/)
    expect(text).toMatch(/Projections/)
  })

  it("examplesFromFields falls back to --input when there are no fields", () => {
    expect(examplesFromFields("ecp", "jsonata:transform", [])[0]).toMatch(/--input payload.json/)
    expect(examplesFromFields("ecp", "run", ["workflow-path"])[0]).toMatch(/--workflow-path/)
  })

  it("schemaFieldNames ignores non-objects", () => {
    expect(schemaFieldNames(undefined)).toEqual([])
    expect(schemaFieldNames(z.string())).toEqual([])
    expect(schemaFieldNames(z.object({ a: z.string() }))).toEqual(["a"])
  })
})
