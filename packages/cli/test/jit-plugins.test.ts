import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { jitPluginForTopic } from "../src/lib/jit-plugins.js"

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("jitPluginForTopic", () => {
  const jit = {
    "@executioncontrolprotocol/mcp": "^0.51",
    "@executioncontrolprotocol/plugin-app": "^0.51",
  }

  it("maps mcp to the unprefixed JIT package", () => {
    expect(jitPluginForTopic("mcp", jit)).toBe("@executioncontrolprotocol/mcp")
  })

  it("does not map jsonata when it is not a JIT plugin", () => {
    expect(jitPluginForTopic("jsonata", jit)).toBeUndefined()
  })

  it("maps plugin-prefixed JIT packages", () => {
    expect(
      jitPluginForTopic("app", { "@executioncontrolprotocol/plugin-app": "^0.51" })
    ).toBe("@executioncontrolprotocol/plugin-app")
  })

  it("returns undefined for an empty topic", () => {
    expect(jitPluginForTopic("", jit)).toBeUndefined()
  })

  it("pins @executioncontrolprotocol/mcp in oclif.jitPlugins", () => {
    const pkg = JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8")) as {
      oclif: { jitPlugins: Record<string, string> }
    }
    expect(pkg.oclif.jitPlugins["@executioncontrolprotocol/mcp"]).toBe("^0.51")
    expect(pkg.oclif.jitPlugins["@executioncontrolprotocol/plugin-app"]).toBe("^0.51")
  })
})
