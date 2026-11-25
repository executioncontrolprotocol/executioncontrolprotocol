import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import {
  ecpDataDir,
  ecpHome,
  ensureHomeLayout,
  hasPluginEntries,
  maybeWarnLegacyPluginDir,
  oclifDefaultDataDir,
} from "../src/lib/home.js"

const temps: string[] = []

afterEach(async () => {
  while (temps.length > 0) {
    const dir = temps.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  temps.push(dir)
  return dir
}

describe("home / data dir", () => {
  it("uses explicit ECP_HOME and ECP_DATA_DIR", () => {
    const env = { ECP_HOME: "/tmp/ecp-home", ECP_DATA_DIR: "/tmp/custom-data" }
    expect(ecpHome(env)).toBe(path.resolve("/tmp/ecp-home"))
    expect(ecpDataDir(env)).toBe(path.resolve("/tmp/custom-data"))
  })

  it("defaults ECP_DATA_DIR to $ECP_HOME/plugins", async () => {
    const home = await tempDir("ecp-home-")
    const env = { ECP_HOME: home }
    expect(ecpDataDir(env)).toBe(path.join(home, "plugins"))
  })

  it("ensureHomeLayout creates dirs and sets env", async () => {
    const home = await tempDir("ecp-layout-")
    const env: NodeJS.ProcessEnv = { ECP_HOME: home }
    const result = ensureHomeLayout(env)
    expect(result.home).toBe(path.resolve(home))
    expect(result.dataDir).toBe(path.join(path.resolve(home), "plugins"))
    expect(existsSync(result.home)).toBe(true)
    expect(existsSync(result.dataDir)).toBe(true)
    expect(env.ECP_HOME).toBe(result.home)
    expect(env.ECP_DATA_DIR).toBe(result.dataDir)
  })

  it("oclifDefaultDataDir mirrors Windows LOCALAPPDATA", () => {
    const env = { LOCALAPPDATA: "C:\\LocalAppData", HOME: "C:\\Users\\test" }
    const previous = process.platform
    // Function reads process.platform; on this runner assert the XDG / LOCALAPPDATA branches via env.
    if (process.platform === "win32") {
      expect(oclifDefaultDataDir(env)).toBe(path.join("C:\\LocalAppData", "ecp"))
    } else {
      expect(oclifDefaultDataDir({ XDG_DATA_HOME: "/xdg", HOME: "/home/test" })).toBe(
        path.join("/xdg", "ecp"),
      )
      expect(oclifDefaultDataDir({ HOME: "/home/test" })).toBe(path.join("/home/test", ".local/share", "ecp"))
    }
    expect(previous).toBe(process.platform)
  })

  it("oclifDefaultDataDir prefers XDG_DATA_HOME over LOCALAPPDATA", () => {
    const dir = oclifDefaultDataDir({
      XDG_DATA_HOME: "/xdg-data",
      LOCALAPPDATA: "C:\\Local",
      HOME: "/home/test",
    })
    expect(dir).toBe(path.join("/xdg-data", "ecp"))
  })
})

describe("setup-env.js parity with home.ts", () => {
  it("computes the same ECP_HOME and ECP_DATA_DIR for the same env inputs", async () => {
    const setupEnvUrl = pathToFileURL(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/setup-env.js"),
    ).href
    const setup = (await import(setupEnvUrl)) as {
      resolveEcpHome(env?: NodeJS.ProcessEnv): string
      resolveEcpDataDir(env?: NodeJS.ProcessEnv): string
    }

    const cases: NodeJS.ProcessEnv[] = [
      {},
      { ECP_HOME: "/tmp/parity-home" },
      { ECP_HOME: "/tmp/parity-home", ECP_DATA_DIR: "/tmp/parity-data" },
      { ECP_DATA_DIR: "/tmp/only-data" },
    ]
    for (const env of cases) {
      expect(setup.resolveEcpHome(env)).toBe(ecpHome(env))
      expect(setup.resolveEcpDataDir(env)).toBe(ecpDataDir(env))
    }
  })

  it("bin/ecp.js passes loadOptions userPlugins false", () => {
    const binPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/ecp.js")
    const source = readFileSync(binPath, "utf8")
    expect(source).toMatch(/loadOptions:\s*\{\s*userPlugins:\s*false\s*\}/)
  })
})

describe("host-discovery warm path imports", () => {
  it("uses host/client for discovery and lazy-imports createLocalHost", () => {
    const discoveryPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/lib/host-discovery.ts",
    )
    const source = readFileSync(discoveryPath, "utf8")
    expect(source).toMatch(/from "@executioncontrolprotocol\/host\/client"/)
    expect(source).toMatch(/await import\("@executioncontrolprotocol\/host"\)/)
    expect(source).not.toMatch(/createLocalHost[^{\n]*from "@executioncontrolprotocol\/host"/)
  })
})

describe("maybeWarnLegacyPluginDir", () => {
  it("prints once, writes stamp, then stays silent", async () => {
    const home = await tempDir("ecp-notice-home-")
    const legacyRoot = await tempDir("ecp-notice-legacy-")
    const legacyDir = path.join(legacyRoot, "ecp")
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      path.join(legacyDir, "package.json"),
      JSON.stringify({
        private: true,
        oclif: { plugins: [{ type: "link", name: "stale", root: "/missing" }] },
      }),
    )

    const env: NodeJS.ProcessEnv = {
      ECP_HOME: home,
      ...(process.platform === "win32"
        ? { LOCALAPPDATA: legacyRoot }
        : { XDG_DATA_HOME: legacyRoot, HOME: home }),
    }
    ensureHomeLayout(env)

    const lines: string[] = []
    const stderr = { write: (chunk: string) => void lines.push(chunk) }

    expect(maybeWarnLegacyPluginDir(env, stderr)).toBe(true)
    expect(lines[0]).toMatch(/legacy plugins found/)
    expect(existsSync(path.join(home, ".ecp-noticed-legacy-plugins"))).toBe(true)

    lines.length = 0
    expect(maybeWarnLegacyPluginDir(env, stderr)).toBe(false)
    expect(lines).toHaveLength(0)
  })

  it("stays silent when stamp already exists", async () => {
    const home = await tempDir("ecp-stamp-")
    const legacyRoot = await tempDir("ecp-stamp-legacy-")
    const legacyDir = path.join(legacyRoot, "ecp")
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      path.join(legacyDir, "package.json"),
      JSON.stringify({ oclif: { plugins: [{ type: "link", name: "x", root: "/x" }] } }),
    )
    writeFileSync(path.join(home, ".ecp-noticed-legacy-plugins"), "1\n")
    const env: NodeJS.ProcessEnv = {
      ECP_HOME: home,
      ...(process.platform === "win32" ? { LOCALAPPDATA: legacyRoot } : { XDG_DATA_HOME: legacyRoot }),
    }
    const lines: string[] = []
    expect(maybeWarnLegacyPluginDir(env, { write: (c) => void lines.push(c) })).toBe(false)
    expect(lines).toHaveLength(0)
  })

  it("stays silent when new dir already has plugins", async () => {
    const home = await tempDir("ecp-has-new-")
    const dataDir = path.join(home, "plugins")
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(
      path.join(dataDir, "package.json"),
      JSON.stringify({ oclif: { plugins: [{ type: "link", name: "new", root: "/new" }] } }),
    )
    const legacyRoot = await tempDir("ecp-has-old-")
    const legacyDir = path.join(legacyRoot, "ecp")
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(
      path.join(legacyDir, "package.json"),
      JSON.stringify({ oclif: { plugins: [{ type: "link", name: "old", root: "/old" }] } }),
    )
    const env: NodeJS.ProcessEnv = {
      ECP_HOME: home,
      ...(process.platform === "win32" ? { LOCALAPPDATA: legacyRoot } : { XDG_DATA_HOME: legacyRoot }),
    }
    const lines: string[] = []
    expect(maybeWarnLegacyPluginDir(env, { write: (c) => void lines.push(c) })).toBe(false)
    expect(lines).toHaveLength(0)
  })

  it("stays silent when old dir is empty", async () => {
    const home = await tempDir("ecp-empty-old-home-")
    const legacyRoot = await tempDir("ecp-empty-old-")
    mkdirSync(path.join(legacyRoot, "ecp"), { recursive: true })
    const env: NodeJS.ProcessEnv = {
      ECP_HOME: home,
      ...(process.platform === "win32" ? { LOCALAPPDATA: legacyRoot } : { XDG_DATA_HOME: legacyRoot }),
    }
    expect(hasPluginEntries(path.join(legacyRoot, "ecp"))).toBe(false)
    const lines: string[] = []
    expect(maybeWarnLegacyPluginDir(env, { write: (c) => void lines.push(c) })).toBe(false)
    expect(lines).toHaveLength(0)
  })
})
