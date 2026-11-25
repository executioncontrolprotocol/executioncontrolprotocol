import { spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
} from "./support.js"

const UNREACHABLE_REGISTRY = "http://127.0.0.1:1/"
const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/minimal-plugin")

describe("ecp plugins commands", () => {
  it("link, install tarball, idempotent install, uninstall, bad manifest", async () => {
    assertCliBuilt()
    const { env, home, dataDir } = await createCliHome({ linkPluginTest: false })
    env.ECP_NPM_REGISTRY = UNREACHABLE_REGISTRY

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install", "--json"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)
    const linkEnv = parseJsonStdout<{ ok: boolean; data: { manifest: { ok: boolean }; root: string } }>(link.stdout)
    expect(linkEnv.ok).toBe(true)
    expect(linkEnv.data.manifest.ok).toBe(true)

    const list = await runEcp(["plugins", "--json", "--no-start-host"], { env, timeoutMs: 60_000 })
    expect(list.code).toBe(0)

    const packDir = path.join(home, "pack")
    mkdirSync(packDir, { recursive: true })
    const tarball = await packDirectory(fixtureRoot, packDir)
    const install = await runEcp(["plugins", "install", tarball, "--json"], { env, timeoutMs: 120_000 })
    expect(install.code, install.stderr + install.stdout).toBe(0)

    const again = await runEcp(["plugins", "install", tarball, "--json"], { env, timeoutMs: 60_000 })
    expect(again.code).toBe(0)
    const againEnv = parseJsonStdout<{ data: { alreadyInstalled?: boolean } }>(again.stdout)
    expect(againEnv.data.alreadyInstalled).toBe(true)

    const uninstall = await runEcp(
      ["plugins", "uninstall", "@executioncontrolprotocol/minimal-fixture", "--json"],
      { env },
    )
    expect(uninstall.code).toBe(0)

    const uninstallTwice = await runEcp(
      ["plugins", "uninstall", "@executioncontrolprotocol/minimal-fixture", "--json"],
      { env },
    )
    expect(uninstallTwice.code).toBe(2)
    expect(parseJsonStdout<{ error: { code: string } }>(uninstallTwice.stdout).error.code).toBe("ECP_NOT_FOUND")

    const badRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-bad-plug-"))
    cpSync(fixtureRoot, badRoot, { recursive: true })
    rmSync(path.join(badRoot, "ecp.manifest.json"))
    const badPack = path.join(home, "bad-pack")
    mkdirSync(badPack, { recursive: true })
    const badTgz = await packDirectory(badRoot, badPack)
    const badInstall = await runEcp(["plugins", "install", badTgz, "--json"], { env, timeoutMs: 120_000 })
    expect(badInstall.code).toBe(2)
    const badEnv = parseJsonStdout<{ ok: boolean; error: { suggestions?: string[] } }>(badInstall.stdout)
    expect(badEnv.ok).toBe(false)
    expect(badEnv.error.suggestions?.join(" ")).toContain("ecp-plugin-manifest")
    expect(existsSync(path.join(dataDir, ".ecp-plugins-changed"))).toBe(true)
  }, 300_000)

  it("update with only a link exits 0 without registry", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: true })
    env.ECP_NPM_REGISTRY = UNREACHABLE_REGISTRY
    const update = await runEcp(["plugins", "update", "--json"], { env })
    expect(update.code).toBe(0)
    expect(parseJsonStdout<{ data: { updated: unknown[] } }>(update.stdout).data.updated).toEqual([])
  })

  it("reset removes a linked plugin", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: true })
    env.ECP_NPM_REGISTRY = UNREACHABLE_REGISTRY
    const reset = await runEcp(["plugins", "reset", "--json"], { env, timeoutMs: 60_000 })
    expect(reset.code).toBe(0)
    const envBody = parseJsonStdout<{ data: { removed: Array<{ package: string }> } }>(reset.stdout)
    expect(envBody.data.removed.some((row) => row.package === "@executioncontrolprotocol/test")).toBe(true)
  })
})

async function packDirectory(cwd: string, outDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["pack", "--pack-destination", outDir],
      { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" },
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