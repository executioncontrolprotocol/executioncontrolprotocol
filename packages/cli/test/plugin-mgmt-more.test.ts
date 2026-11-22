import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Config, Errors } from "@oclif/core"
import { describe, expect, it } from "vitest"
import {
  OCLIF_KEY_MESSAGE,
  REGENERATE_SUGGESTION,
  expandFriendlyName,
  findPluginByUrl,
  findPluginEntry,
  friendlyNameFromPackage,
  isCliPackageName,
  isLocalPackagePath,
  isMissingOclifKeyError,
  isPluginSpecInstalled,
  isUrlInstallSpec,
  manifestInvalidError,
  manifestReportForRoot,
  missingOclifKeyError,
  npmLogLevel,
  readPackageVersion,
  resolvePackageSpecifier,
  splitPackageTag,
  touchPluginsChangedMarker,
  userPluginRoot,
  type OclifPluginEntry,
  type OclifPluginsInstance,
} from "../src/lib/plugin-mgmt.js"

const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.join(cliRoot, "..", "..")
const pluginTestRoot = path.join(repoRoot, "plugins", "plugin-test")

/** A fake of oclif's Plugins instance: only what the helpers read. */
function fakePlugins(
  entries: OclifPluginEntry[],
  hasPlugin: (name: string) => Promise<OclifPluginEntry | boolean> = async (name) =>
    entries.find((entry) => entry.name === name) ?? false,
): OclifPluginsInstance {
  return {
    list: async () => entries,
    hasPlugin,
    friendlyName: (name: string) => friendlyNameFromPackage(name),
    unfriendlyName: (name: string) => (name.startsWith("@") ? name : `@executioncontrolprotocol/${name}`),
  } as unknown as OclifPluginsInstance
}

describe("plugin-mgmt names and specs", () => {
  it("maps between short and full names, and leaves non-plugin names alone", async () => {
    const config = await Config.load(cliRoot)
    expect(friendlyNameFromPackage("@executioncontrolprotocol/test")).toBe("test")
    expect(friendlyNameFromPackage("left-pad")).toBe("left-pad")
    expect(friendlyNameFromPackage("@other/plugin-x")).toBe("@other/plugin-x")
    // A plugin's package name is its id: first-party short names map to it, no `plugin-` prefix.
    const bare = { pjson: { oclif: {} } } as unknown as Config
    expect(expandFriendlyName("anthropic", bare)).toBe("@executioncontrolprotocol/anthropic")
    expect(expandFriendlyName("jsonata", config)).toBe("@executioncontrolprotocol/jsonata")
    expect(expandFriendlyName("someone-elses", config)).toBe("@executioncontrolprotocol/someone-elses")
    expect(expandFriendlyName("someone-elses", bare)).toBe("someone-elses")
    expect(expandFriendlyName("@acme/thing", config)).toBe("@acme/thing")
    expect(isCliPackageName("@executioncontrolprotocol/cli", config)).toBe(true)
    expect(isCliPackageName("test", config)).toBe(false)
  })

  it("splits tags for scoped, unscoped and tagless names", () => {
    expect(splitPackageTag("@scope")).toEqual({ packageName: "@scope" })
    expect(splitPackageTag("@scope/pkg")).toEqual({ packageName: "@scope/pkg" })
    expect(splitPackageTag("pkg")).toEqual({ packageName: "pkg" })
    expect(splitPackageTag("pkg@1.2.3")).toEqual({ packageName: "pkg", tag: "1.2.3" })
  })

  it("resolves npm names, short names with tags, and local paths", async () => {
    const config = await Config.load(cliRoot)
    expect(resolvePackageSpecifier("test@beta", config)).toEqual({
      spec: "@executioncontrolprotocol/test",
      displayName: "@executioncontrolprotocol/test",
      tag: "beta",
    })
    const local = resolvePackageSpecifier(pluginTestRoot, config)
    expect(local.spec.startsWith("file:")).toBe(true)
    expect(local.displayName).toBe("plugin-test")
    const url = "file:///C:/x/plugin.tgz"
    expect(resolvePackageSpecifier(url, config).spec).toBe(url)
    expect(isLocalPackagePath("./does-not-exist.tgz")).toBe(true)
    expect(isLocalPackagePath("./does-not-exist.tar.gz")).toBe(true)
    expect(isLocalPackagePath("plain-name-that-does-not-exist")).toBe(false)
    expect(isUrlInstallSpec("file:///x")).toBe(true)
    expect(isUrlInstallSpec("@scope/pkg")).toBe(false)
  })

  it("keeps npm quiet unless --verbose, and always quiet for --json", () => {
    expect(npmLogLevel({ json: true, verbose: true })).toBe("silent")
    expect(npmLogLevel({ json: false, verbose: false })).toBe("silent")
    expect(npmLogLevel({ json: false, verbose: true })).toBe("notice")
  })
})

describe("plugin-mgmt manifest checks", () => {
  it("accepts a real ECP plugin and reports a missing or 1.0 manifest with the regenerate hint", async () => {
    expect(await manifestReportForRoot(pluginTestRoot, "link")).toEqual({ ok: true })

    const missing = await mkdtemp(path.join(os.tmpdir(), "ecp-pm-missing-"))
    writeFileSync(path.join(missing, "package.json"), JSON.stringify({ name: "@x/plugin-missing", version: "1.0.0", oclif: {} }))
    const missingReport = await manifestReportForRoot(missing, "user")
    expect(missingReport.ok).toBe(false)

    const legacy = await mkdtemp(path.join(os.tmpdir(), "ecp-pm-legacy-"))
    writeFileSync(
      path.join(legacy, "package.json"),
      JSON.stringify({ name: "@x/plugin-legacy", version: "1.0.0", oclif: {}, ecp: { manifest: "./ecp.manifest.json" } }),
    )
    writeFileSync(path.join(legacy, "ecp.manifest.json"), JSON.stringify({ version: "1.0", capabilities: [] }))
    const legacyReport = await manifestReportForRoot(legacy, "user")
    expect(legacyReport.ok).toBe(false)
    if (!legacyReport.ok) {
      const error = manifestInvalidError(legacyReport.issues)
      expect(error.code).toBe("ECP_MANIFEST_INVALID")
      expect(error.suggestions).toContain(REGENERATE_SUGGESTION)
      expect(new Set(error.suggestions).size).toBe(error.suggestions.length)
    }
  })

  it("falls back to a generic message when there are no issues", () => {
    expect(manifestInvalidError([])).toEqual({
      code: "ECP_MANIFEST_INVALID",
      message: "Plugin manifest is invalid.",
      path: "",
      suggestions: [REGENERATE_SUGGESTION],
    })
  })

  it("recognises oclif's missing-oclif-key error in both forms and explains it", () => {
    expect(isMissingOclifKeyError(new Errors.CLIError("plugin is invalid"))).toBe(true)
    expect(isMissingOclifKeyError(new Errors.CLIError("network down"))).toBe(false)
    expect(isMissingOclifKeyError("Error: plugin is invalid")).toBe(true)
    expect(missingOclifKeyError()).toMatchObject({ message: OCLIF_KEY_MESSAGE, path: "package.json" })
    expect(OCLIF_KEY_MESSAGE).toMatch(/"oclif": \{\}/)
  })
})

describe("plugin-mgmt installed-state lookups", () => {
  const userEntry: OclifPluginEntry = {
    name: "@executioncontrolprotocol/test",
    type: "user",
    url: "file:/C:/tmp/plugin.tgz",
  } as OclifPluginEntry

  it("finds an installed plugin by name, short name and file URL", async () => {
    const config = await Config.load(cliRoot)
    const plugins = fakePlugins([userEntry])
    expect(await isPluginSpecInstalled(plugins, "@executioncontrolprotocol/test", config)).toEqual(userEntry)
    expect(await findPluginEntry(plugins, "test")).toEqual(userEntry)
    expect(await findPluginByUrl(plugins, "file:///C:/tmp/plugin.tgz")).toEqual(userEntry)
    expect(await isPluginSpecInstalled(plugins, "file:///C:/tmp/plugin.tgz", config)).toEqual(userEntry)
    expect(await isPluginSpecInstalled(plugins, "file:///C:/tmp/other.tgz", config)).toBe(false)
    expect(await isPluginSpecInstalled(fakePlugins([]), "test", config)).toBe(false)
  })

  it("looks the entry up when hasPlugin only answers true", async () => {
    const config = await Config.load(cliRoot)
    const plugins = fakePlugins([userEntry], async () => true)
    expect(await isPluginSpecInstalled(plugins, "test", config)).toEqual(userEntry)
  })
})

describe("plugin-mgmt files", () => {
  it("touches the plugins-changed marker, builds user roots and reads versions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ecp-pm-data-"))
    touchPluginsChangedMarker(dir)
    expect(Number(readFileSync(path.join(dir, ".ecp-plugins-changed"), "utf8"))).toBeGreaterThan(0)
    expect(userPluginRoot(dir, "@a/plugin-b")).toBe(path.join(dir, "node_modules", "@a/plugin-b"))
    expect(readPackageVersion(pluginTestRoot)).toMatch(/^\d+\.\d+\.\d+/)
    const empty = path.join(dir, "no-package")
    mkdirSync(empty)
    expect(readPackageVersion(empty)).toBe("")
  })
})
