import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  createIsolatedOsDataDir,
  ecpBin,
  fileUrlForLocalPath,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
  seedPluginLink,
} from "./support.js"

type PluginEnvelope = {
  ok: boolean
  data: {
    type: string
    items: Array<{ package: string; id: string; version: string; source: string; manifestOk: boolean }>
    total: number
  }
}

describe("cli plugins data dir (F1/F16)", () => {
  it("does not load stale OS or $ECP_HOME/plugins links as oclif plugins", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false })
    const { osEcpDataDir } = await createIsolatedOsDataDir(env)
    seedPluginLink(osEcpDataDir, path.join(home, "missing-os-plugin"))
    seedPluginLink(dataDir, path.join(home, "missing-home-plugin"))

    const result = await runEcp(["retrieve", "--type", "formatter", "--json"], { env })
    expect(result.code, result.stderr + result.stdout).toBe(0)
    expect(result.stderr).not.toMatch(/\[ENOENT\]/)
    expect(result.stderr).not.toMatch(/no such file or directory/i)
    expect(result.stderr).not.toMatch(/module: @oclif\/core/)
  })

  it("bin source asserts userPlugins false", () => {
    const source = readFileSync(ecpBin, "utf8")
    expect(source).toMatch(/loadOptions:\s*\{\s*userPlugins:\s*false\s*\}/)
  })

  it("ecp plugins wins over @oclif/plugin-plugins (manifest column + json envelope)", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: false })
    await createIsolatedOsDataDir(env)

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)

    const human = await runEcp(["plugins"], { env })
    expect(human.code, human.stderr + human.stdout).toBe(0)
    expect(human.stdout.toLowerCase()).toMatch(/manifest/)
    expect(human.stdout).toMatch(/plugin-test|@executioncontrolprotocol\/plugin-test/)

    const json = await runEcp(["plugins", "--json"], { env })
    expect(json.code, json.stderr + json.stdout).toBe(0)
    const envelope = parseJsonStdout<PluginEnvelope>(json.stdout)
    expect(envelope.ok).toBe(true)
    expect(envelope.data.type).toBe("plugin")
    expect(Array.isArray(envelope.data.items)).toBe(true)
    expect(typeof envelope.data.total).toBe("number")
    expect(envelope.data.items.some((item) => item.package.includes("plugin-test"))).toBe(true)
  }, 120_000)

  it("plugins --json matches retrieve --type plugin; stale OS entries absent", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false })
    const { osEcpDataDir } = await createIsolatedOsDataDir(env)
    seedPluginLink(osEcpDataDir, path.join(home, "stale-os-only"), "@executioncontrolprotocol/plugin-stale-os")

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)
    expect(existsSync(path.join(dataDir, "package.json"))).toBe(true)

    const listed = await runEcp(["plugins", "--json"], { env })
    const retrieved = await runEcp(["retrieve", "--type", "plugin", "--json"], { env })
    expect(listed.code, listed.stderr + listed.stdout).toBe(0)
    expect(retrieved.code, retrieved.stderr + retrieved.stdout).toBe(0)

    const listEnv = parseJsonStdout<PluginEnvelope>(listed.stdout)
    const retrieveEnv = parseJsonStdout<PluginEnvelope>(retrieved.stdout)
    expect(listEnv.data.items.map((item) => item.package).sort()).toEqual(
      retrieveEnv.data.items.map((item) => item.package).sort(),
    )
    expect(listEnv.data.items.every((item) => !item.package.includes("stale-os"))).toBe(true)
    expect(listEnv.data.total).toBe(retrieveEnv.data.total)
  }, 120_000)

  it("unlink keeps plugins and retrieve views equal", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: false })
    await createIsolatedOsDataDir(env)

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)

    const uninstall = await runEcp(["plugins", "uninstall", "@executioncontrolprotocol/plugin-test"], {
      env,
      timeoutMs: 90_000,
    })
    expect(uninstall.code, uninstall.stderr + uninstall.stdout).toBe(0)

    const listed = await runEcp(["plugins", "--json"], { env })
    const retrieved = await runEcp(["retrieve", "--type", "plugin", "--json"], { env })
    expect(listed.code).toBe(0)
    expect(retrieved.code).toBe(0)
    const listEnv = parseJsonStdout<PluginEnvelope>(listed.stdout)
    const retrieveEnv = parseJsonStdout<PluginEnvelope>(retrieved.stdout)
    expect(listEnv.data.items.map((item) => item.package).sort()).toEqual(
      retrieveEnv.data.items.map((item) => item.package).sort(),
    )
    expect(listEnv.data.items.some((item) => item.package.includes("plugin-test"))).toBe(false)
  }, 180_000)

  it("tarball install keeps plugins and retrieve views equal", async () => {
    assertCliBuilt()
    const { env, home } = await createCliHome({ linkPluginTest: false })
    await createIsolatedOsDataDir(env)
    const packDir = path.join(home, "pack")
    mkdirSync(packDir, { recursive: true })
    const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/minimal-plugin")
    const tarball = await packDirectory(fixtureRoot, packDir)

    const install = await runEcp(["plugins", "install", fileUrlForLocalPath(tarball)], {
      env,
      timeoutMs: 120_000,
    })
    expect(install.code, install.stderr + install.stdout).toBe(0)

    const listed = await runEcp(["plugins", "--json"], { env })
    const retrieved = await runEcp(["retrieve", "--type", "plugin", "--json"], { env })
    expect(listed.code).toBe(0)
    expect(retrieved.code).toBe(0)
    const listEnv = parseJsonStdout<PluginEnvelope>(listed.stdout)
    const retrieveEnv = parseJsonStdout<PluginEnvelope>(retrieved.stdout)
    expect(listEnv.data.items.map((item) => item.package).sort()).toEqual(
      retrieveEnv.data.items.map((item) => item.package).sort(),
    )
    expect(listEnv.data.items.some((item) => item.package.includes("minimal"))).toBe(true)

    const uninstall = await runEcp(
      ["plugins", "uninstall", "@executioncontrolprotocol/plugin-minimal-fixture"],
      {
        env,
        timeoutMs: 90_000,
      },
    )
    expect(uninstall.code, uninstall.stderr + uninstall.stdout).toBe(0)

    const afterList = parseJsonStdout<PluginEnvelope>((await runEcp(["plugins", "--json"], { env })).stdout)
    const afterRetrieve = parseJsonStdout<PluginEnvelope>(
      (await runEcp(["retrieve", "--type", "plugin", "--json"], { env })).stdout,
    )
    expect(afterList.data.items.map((item) => item.package).sort()).toEqual(
      afterRetrieve.data.items.map((item) => item.package).sort(),
    )
  }, 240_000)

  it("migration notice appears once on stderr then not again", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ linkPluginTest: false })
    const { osEcpDataDir } = await createIsolatedOsDataDir(env)
    seedPluginLink(osEcpDataDir, path.join(home, "legacy-only"), "@executioncontrolprotocol/plugin-legacy")

    const first = await runEcp(["retrieve", "--type", "formatter", "--json"], { env })
    expect(first.code, first.stderr + first.stdout).toBe(0)
    expect(first.stderr).toMatch(/legacy plugins found/)
    expect(existsSync(path.join(home, ".ecp-noticed-legacy-plugins"))).toBe(true)

    const second = await runEcp(["retrieve", "--type", "formatter", "--json"], { env })
    expect(second.code).toBe(0)
    expect(second.stderr).not.toMatch(/legacy plugins found/)
  }, 120_000)
})

async function packDirectory(cwd: string, outDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["pack", "--pack-destination", outDir],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      },
    )
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pnpm pack failed: ${stderr}`))
        return
      }
      const tgz = readdirSync(outDir).find((name) => name.endsWith(".tgz"))
      if (!tgz) {
        reject(new Error(`no tarball in ${outDir}`))
        return
      }
      resolve(path.join(outDir, tgz))
    })
  })
}
