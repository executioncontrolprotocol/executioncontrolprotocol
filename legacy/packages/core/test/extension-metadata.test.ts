import { describe, expect, it } from "vitest"
import { parseExtensionMetadata } from "@executioncontrolprotocol/core/types"

describe("parseExtensionMetadata", () => {
  it("accepts an optional kebab-case topicAlias", () => {
    const parsed = parseExtensionMetadata({
      summary: "Call Adobe Firefly Services APIs",
      description: "Generated Adobe Firefly Services capabilities.",
      topicAlias: "firefly",
    })
    expect(parsed.topicAlias).toBe("firefly")
  })

  it("rejects a non-kebab topicAlias", () => {
    expect(() =>
      parseExtensionMetadata({
        summary: "Demo",
        description: "A demo extension.",
        topicAlias: "Firefly Alias",
      })
    ).toThrow(/topicAlias/)
  })

  it("still rejects unknown keys", () => {
    expect(() =>
      parseExtensionMetadata({
        summary: "Demo",
        description: "A demo extension.",
        samplePrompts: ["do not"],
      })
    ).toThrow()
  })
})
