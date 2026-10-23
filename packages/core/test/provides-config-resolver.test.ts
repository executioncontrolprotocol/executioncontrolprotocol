import { describe, expect, it } from "vitest"
import { defineExtension } from "../src/index.js"

describe("defineExtension().providesConfigResolver()", () => {
  it("defaults to unset", () => {
    const def = defineExtension("@executioncontrolprotocol", "plain")
      .withCapabilities([])
      .build()
    expect(def.providesConfigResolver).toBeUndefined()
  })

  it("sets the flag when called", () => {
    const def = defineExtension("@executioncontrolprotocol", "secrets-like")
      .providesConfigResolver()
      .withCapabilities([])
      .build()
    expect(def.providesConfigResolver).toBe(true)
  })

  it("can be turned off explicitly", () => {
    const def = defineExtension("@executioncontrolprotocol", "opt-out")
      .providesConfigResolver(false)
      .withCapabilities([])
      .build()
    expect(def.providesConfigResolver).toBeUndefined()
  })
})
