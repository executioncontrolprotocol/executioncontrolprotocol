import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  ecpDataDir,
  ecpHome,
  ensureHomeLayout,
  hasPluginEntries,
  maybeWarnLegacyPluginDir,
  oclifDefaultDataDir,
} from "../../src/lib/home.js"

describe("ecpHome and ecpDataDir", () => {
  it("defaults to ~/.ecp when ECP_HOME is unset", () => {
    expect(ecpHome({})).toBe(path.join(os.homedir(), ".ecp"))
    expect(ecpDataDir({})).toBe(path.join(os.homedir(), ".ecp", "plugins"))
  })

  it("honours overrides on the environment", () => {
    const env = {
      ECP_HOME: "/tmp/ecp-home-test",
      ECP_DATA_DIR: "/tmp/ecp-data-test",
    }
    expect(ecpHome(env)).toBe(path.resolve("/tmp/ecp-home-test"))
    expect(ecpDataDir(env)).toBe(path.resolve("/tmp/ecp-data-test"))
  })

  it("creates home and data directories", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-home-"))
    const env = { ECP_HOME: path.join(base, "home") }
    const layout = ensureHomeLayout(env)
    expect(layout.home).toBe(path.resolve(env.ECP_HOME!))
    expect(layout.dataDir).toBe(path.join(layout.home, "plugins"))
    rmSync(base, { recursive: true, force: true })
  })
})

describe("hasPluginEntries", () => {
  it("detects oclif and dependency plugins", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-has-plugins-"))
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ oclif: { plugins: ["@scope/p"] }, dependencies: { a: "1" } }),
    )
    expect(hasPluginEntries(dir)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns true when only dependencies are listed", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-deps-only-"))
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { "@scope/p": "1.0.0" } }))
    expect(hasPluginEntries(dir)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns false when package.json has no plugin entries", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-empty-plugins-"))
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ oclif: { plugins: [] } }))
    expect(hasPluginEntries(dir)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns false for a missing or unreadable package.json", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-no-plugins-"))
    expect(hasPluginEntries(dir)).toBe(false)
    writeFileSync(path.join(dir, "package.json"), "{")
    expect(hasPluginEntries(dir)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("maybeWarnLegacyPluginDir", () => {
  it("skips when the legacy data dir has no plugin entries", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ecp-legacy-empty-"))
    const home = path.join(base, "home")
    const xdg = path.join(base, "xdg")
    mkdirSync(home, { recursive: true })
    mkdirSync(path.join(xdg, "ecp"), { recursive: true })
    const stderr = { write: vi.fn() }
    expect(maybeWarnLegacyPluginDir({ ECP_HOME: home, XDG_DATA_HOME: xdg, HOME: base }, stderr)).toBe(false)
    rmSync(base, { recursive: true, force: true })
  })

  it("prints a notice when legacy data still has plugins", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ecp-legacy-warn-"))
    const home = path.join(base, "home")
    const xdg = path.join(base, "xdg")
    const legacyPlugins = path.join(xdg, "ecp")
    mkdirSync(home, { recursive: true })
    mkdirSync(legacyPlugins, { recursive: true })
    writeFileSync(path.join(legacyPlugins, "package.json"), JSON.stringify({ dependencies: { "@scope/p": "1" } }))
    const stderr = { write: vi.fn() }
    const printed = maybeWarnLegacyPluginDir({ ECP_HOME: home, XDG_DATA_HOME: xdg, HOME: base }, stderr)
    expect(printed).toBe(true)
    expect(stderr.write).toHaveBeenCalled()
    rmSync(base, { recursive: true, force: true })
  })

  it("skips when the current data dir already has plugins", () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "ecp-legacy-current-"))
    const home = path.join(base, "home")
    const plugins = path.join(home, "plugins")
    const xdg = path.join(base, "xdg")
    mkdirSync(plugins, { recursive: true })
    mkdirSync(path.join(xdg, "ecp"), { recursive: true })
    writeFileSync(path.join(plugins, "package.json"), JSON.stringify({ dependencies: { "@scope/current": "1" } }))
    writeFileSync(path.join(xdg, "ecp", "package.json"), JSON.stringify({ dependencies: { "@scope/legacy": "1" } }))
    const stderr = { write: vi.fn() }
    expect(maybeWarnLegacyPluginDir({ ECP_HOME: home, XDG_DATA_HOME: xdg, HOME: base }, stderr)).toBe(false)
    rmSync(base, { recursive: true, force: true })
  })

  it("skips when legacy and current plugin dirs are the same", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-legacy-same-"))
    const plugins = path.join(home, "plugins")
    mkdirSync(plugins, { recursive: true })
    const stderr = { write: vi.fn() }
    expect(
      maybeWarnLegacyPluginDir({ ECP_HOME: home, ECP_DATA_DIR: plugins, XDG_DATA_HOME: path.dirname(plugins) }, stderr),
    ).toBe(false)
    rmSync(home, { recursive: true, force: true })
  })

  it("skips when a stamp file already exists", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "ecp-legacy-stamp-"))
    writeFileSync(path.join(home, ".ecp-noticed-legacy-plugins"), "1")
    const stderr = { write: vi.fn() }
    expect(maybeWarnLegacyPluginDir({ ECP_HOME: home }, stderr)).toBe(false)
    expect(stderr.write).not.toHaveBeenCalled()
    rmSync(home, { recursive: true, force: true })
  })
})

describe("oclifDefaultDataDir", () => {
  it("uses XDG data home when set", () => {
    expect(oclifDefaultDataDir({ XDG_DATA_HOME: "/tmp/xdg", HOME: "/home/x" })).toBe(path.join("/tmp/xdg", "ecp"))
  })

})