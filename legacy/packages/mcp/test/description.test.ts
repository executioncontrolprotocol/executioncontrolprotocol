import { describe, expect, it } from "vitest"
import { toolDescription } from "../src/description.js"

describe("toolDescription", () => {
  it("returns empty string without metadata", () => {
    expect(toolDescription(undefined)).toBe("")
  })

  it("omits a duplicate description that matches the summary", () => {
    expect(toolDescription({ summary: "Echo", description: "Echo" })).toBe("Echo")
  })

  it("includes use cases and projections", () => {
    const text = toolDescription({
      summary: "Transform",
      description: "Run an expression.",
      useCases: ["Map a payload"],
      projections: [{ summary: "Take result", description: "The evaluated value." }],
    })
    expect(text).toContain("Use cases:")
    expect(text).toContain("- Map a payload")
    expect(text).toContain("Projections:")
    expect(text).toContain("- Take result: The evaluated value.")
  })
})
