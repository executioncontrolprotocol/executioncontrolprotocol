import { describe, expect, it } from "vitest"
import {
  collectPackagesFromEnvironmentSource,
  npmPackageFromSpecifier,
} from "../../src/lib/init/collect-env-packages.js"
import {
  createPackageJson,
  mergeMissingDependencies,
} from "../../src/lib/init/merge-package-json.js"

describe("npmPackageFromSpecifier", () => {
  it("maps scoped subpaths to the owning package", () => {
    expect(npmPackageFromSpecifier("@executioncontrolprotocol/core/testing")).toBe(
      "@executioncontrolprotocol/core"
    )
    expect(npmPackageFromSpecifier("@executioncontrolprotocol/format-toon")).toBe(
      "@executioncontrolprotocol/format-toon"
    )
  })

  it("skips relative and node built-ins", () => {
    expect(npmPackageFromSpecifier("./local.js")).toBeUndefined()
    expect(npmPackageFromSpecifier("node:fs")).toBeUndefined()
  })
})

describe("collectPackagesFromEnvironmentSource", () => {
  it("collects side-effect imports and always includes node", () => {
    const pkgs = collectPackagesFromEnvironmentSource(`
import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"
import "@executioncontrolprotocol/format-toon"
`)
    expect(pkgs).toContain("@executioncontrolprotocol/node")
    expect(pkgs).toContain("@executioncontrolprotocol/core")
    expect(pkgs).toContain("@executioncontrolprotocol/format-toon")
  })

  it("does not invent package names from extension ids in bindings", () => {
    const pkgs = collectPackagesFromEnvironmentSource(`
import { environment, extension } from "@executioncontrolprotocol/node"
export default await environment("dev").withExtensions([
  extension("@executioncontrolprotocol/openai").with({}),
])
`)
    expect(pkgs).toEqual(["@executioncontrolprotocol/node"])
    expect(pkgs).not.toContain("@executioncontrolprotocol/openai")
  })
})

describe("mergeMissingDependencies", () => {
  it("does not bump existing ranges", () => {
    const { next, added } = mergeMissingDependencies(
      {
        dependencies: { "@executioncontrolprotocol/node": "^0.11.1" },
        devDependencies: { "@executioncontrolprotocol/cli": "^0.11.1" },
      },
      ["@executioncontrolprotocol/node", "@executioncontrolprotocol/format-toon"]
    )
    expect(next.dependencies?.["@executioncontrolprotocol/node"]).toBe("^0.11.1")
    expect(next.devDependencies?.["@executioncontrolprotocol/cli"]).toBe("^0.11.1")
    expect(added).toEqual(["@executioncontrolprotocol/format-toon"])
  })

  it("creates greenfield package.json with star ranges", () => {
    const pkg = createPackageJson("demo", ["@executioncontrolprotocol/node"])
    expect(pkg.type).toBe("module")
    expect(pkg.dependencies?.["@executioncontrolprotocol/node"]).toBe("*")
    expect(pkg.devDependencies?.["@executioncontrolprotocol/cli"]).toBe("*")
  })
})
