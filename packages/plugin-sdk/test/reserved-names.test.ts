import { describe, expect, it } from "vitest"
import { generatedPackageFields } from "../src/build/generated-pjson.js"
import { defineExtension } from "@executioncontrolprotocol/core"

describe("reserved plugin topics", () => {
  it("rejects a definition whose name collides with a reserved root command", () => {
    const ext = defineExtension("@executioncontrolprotocol", "run").withCapabilities([]).build()
    expect(() => generatedPackageFields(ext)).toThrow(/reserved/)
  })
})
