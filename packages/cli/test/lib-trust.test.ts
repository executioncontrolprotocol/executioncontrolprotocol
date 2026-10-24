import { describe, expect, it } from "vitest"
import { pluginNameFromSpec, pluginSourceKind } from "../src/lib/plugin-source.js"
import { isFirstPartyPackage } from "../src/lib/npm-registry.js"

describe("plugin source helpers", () => {
  it("classifies npm, git and path specs", () => {
    expect(pluginSourceKind("@executioncontrolprotocol/plugin-jsonata")).toBe("npm")
    expect(pluginSourceKind("git+https://github.com/org/repo.git")).toBe("git")
    expect(pluginSourceKind("../plugins/plugin-jsonata")).toBe("path")
  })

  it("strips versions from scoped specs", () => {
    expect(pluginNameFromSpec("@executioncontrolprotocol/plugin-jsonata@1.2.3")).toBe(
      "@executioncontrolprotocol/plugin-jsonata"
    )
    expect(pluginNameFromSpec("jsonata@1.0.0")).toBe("jsonata")
  })

  it("marks first-party packages", () => {
    expect(isFirstPartyPackage("@executioncontrolprotocol/plugin-jsonata")).toBe(true)
    expect(isFirstPartyPackage("acme/jsonata")).toBe(false)
  })
})
