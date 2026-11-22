import { describe, expect, it } from "vitest"
import { isBundledCorePluginName } from "../src/commands/plugins/uninstall.js"

describe("bundled core plugin uninstall guard", () => {
  it("rejects short names core and plugin-core", () => {
    expect(isBundledCorePluginName("core", "x")).toBe(true)
    expect(isBundledCorePluginName("plugin-core", "x")).toBe(true)
  })

  it("rejects scoped package names", () => {
    expect(isBundledCorePluginName("@executioncontrolprotocol/core", "x")).toBe(true)
    expect(
      isBundledCorePluginName("core", "@executioncontrolprotocol/core"),
    ).toBe(true)
  })

  it("allows other plugins", () => {
    expect(isBundledCorePluginName("test", "@executioncontrolprotocol/test")).toBe(false)
  })
})