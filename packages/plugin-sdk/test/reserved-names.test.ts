import { describe, expect, it } from "vitest"
import { generatedPackageFields } from "../src/build/generated-pjson.js"
import { defineExtension } from "@executioncontrolprotocol/core"

describe("reserved plugin topics", () => {
  it("rejects a definition whose name collides with a reserved root command", () => {
    const ext = defineExtension("@executioncontrolprotocol", "run").withCapabilities([]).build()
    expect(() => generatedPackageFields(ext)).toThrow(/reserved/)
  })

  it("rejects a topicAlias that collides with a reserved root command", () => {
    const ext = defineExtension("@executioncontrolprotocol", "demo")
      .withMetadata({
        summary: "Demo",
        description: "A demo extension.",
        topicAlias: "plugins",
      })
      .withCapabilities([])
      .build()
    expect(() => generatedPackageFields(ext)).toThrow(/topic alias/)
  })

  it("rejects workflows and environments topics and allows former root verbs", () => {
    const workflows = defineExtension("@executioncontrolprotocol", "workflows")
      .withCapabilities([])
      .build()
    expect(() => generatedPackageFields(workflows)).toThrow(/reserved/)
    const environments = defineExtension("@executioncontrolprotocol", "environments")
      .withCapabilities([])
      .build()
    expect(() => generatedPackageFields(environments)).toThrow(/reserved/)
    const describe = defineExtension("@executioncontrolprotocol", "describe")
      .withCapabilities([])
      .build()
    expect(() => generatedPackageFields(describe)).not.toThrow()
  })
})
