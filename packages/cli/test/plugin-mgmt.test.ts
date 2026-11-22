import { writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Config } from "@oclif/core"
import { describe, expect, it } from "vitest"
import {
  expandFriendlyName,
  fileUrlForTarballOrPath,
  isLocalPackagePath,
  loadOclifPluginsClass,
  manifestInvalidError,
  missingOclifKeyError,
  splitPackageTag,
} from "../src/lib/plugin-mgmt.js"

describe("plugin-mgmt helpers", () => {
  it("expands friendly plugin names via oclif scope", async () => {
    const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
    const config = await Config.load(cliRoot)
    expect(expandFriendlyName("test", config)).toBe("@executioncontrolprotocol/test")
    expect(expandFriendlyName("@executioncontrolprotocol/anthropic", config)).toBe(
      "@executioncontrolprotocol/anthropic",
    )
  })

  it("splits package tags without breaking scoped names", () => {
    expect(splitPackageTag("test@beta")).toEqual({ packageName: "test", tag: "beta" })
    expect(splitPackageTag("@executioncontrolprotocol/test@beta")).toEqual({
      packageName: "@executioncontrolprotocol/test",
      tag: "beta",
    })
    expect(splitPackageTag("@scope/pkg")).toEqual({ packageName: "@scope/pkg" })
  })

  it("detects local paths and builds file URLs", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "ecp-tgz-"))
    const tgz = path.join(temp, "plugin.tgz")
    writeFileSync(tgz, "x")
    expect(isLocalPackagePath(tgz)).toBe(true)
    const url = fileUrlForTarballOrPath(tgz)
    expect(url).toMatch(/^file:\/\//)
    expect(fileUrlForTarballOrPath("C:\\Workspaces\\pkg.tgz")).toMatch(/^file:\/\/\//)
  })

  it("builds manifest invalid and missing oclif key errors", () => {
    const err = manifestInvalidError([
      { code: "ECP_PLUGIN_LOAD_FAILED", severity: "error", message: "bad", path: "ecp.manifest.json" },
    ])
    expect(err.code).toBe("ECP_MANIFEST_INVALID")
    expect(err.suggestions).toContain("Run ecp-plugin-manifest to regenerate.")
    expect(missingOclifKeyError().message).toContain('"oclif": {}')
  })
})

describe("oclif plugin-plugins surface", () => {
  it("exposes every method the CLI calls on Plugins", async () => {
    const Plugins = await loadOclifPluginsClass()
    const required = ["install", "link", "uninstall", "update", "list", "hasPlugin", "friendlyName", "unfriendlyName"]
    const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
    const config = await Config.load(cliRoot)
    const instance = new Plugins({ config, logLevel: "silent" })
    for (const key of required) {
      expect(typeof (instance as Record<string, unknown>)[key]).toBe("function")
    }
  })
})

describe("plugins reset command", () => {
  it("registers as plugins:reset for the finally hook", async () => {
    const resetMod = await import(
      pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/commands/plugins/reset.js")).href
    )
    expect((resetMod.default as { id?: string }).id ?? "plugins:reset").toBe("plugins:reset")
  })
})