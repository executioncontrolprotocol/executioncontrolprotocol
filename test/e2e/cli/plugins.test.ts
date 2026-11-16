import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { setTimeout as delay } from "node:timers/promises"
import {
  assertCliBuilt,
  createCliHome,
  fileUrlForLocalPath,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
  waitForHost,
} from "./support.js"

describe("cli plugins e2e", () => {
  it("plugins link of plugin-test restarts a running host", async () => {
    assertCliBuilt()
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false })
    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 30_000 })
    expect(start.code).toBe(0)
    await waitForHost(home)
    const { readHostJson } = await import("../../../packages/host/src/index.js")
    const before = readHostJson(home)!
    const hostPidBefore = before.hostPid

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)

    // Marker should exist after the hook.
    expect(existsSync(path.join(dataDir, ".ecp-plugins-changed"))).toBe(true)

    const deadline = Date.now() + 45_000
    let restarted = false
    while (Date.now() < deadline) {
      const next = readHostJson(home)
      if (next && next.hostPid !== hostPidBefore && next.token === before.token) {
        restarted = true
        break
      }
      await delay(200)
    }
    expect(restarted).toBe(true)

    const retrieve = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], {
      env,
    })
    expect(retrieve.code).toBe(0)
    const envelope = parseJsonStdout<{ ok: boolean; data: { items: Array<{ id: string }> } }>(
      retrieve.stdout,
    )
    expect(envelope.data.items.some((item) => item.id.includes("echo"))).toBe(true)
  }, 180_000)

  it("plugins install from pnpm pack tarball", async () => {
    assertCliBuilt()
    const { env, home } = await createCliHome({ linkPluginTest: false })
    const packDir = path.join(home, "pack")
    mkdirSync(packDir, { recursive: true })
    const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/minimal-plugin")
    const tarball = await packDirectory(fixtureRoot, packDir)
    // oclif parsePlugin treats absolute Windows paths as npm names; use a long-path file URL.
    const install = await runEcp(["plugins", "install", fileUrlForLocalPath(tarball)], {
      env,
      timeoutMs: 120_000,
    })
    expect(install.code, install.stderr + install.stdout).toBe(0)

    const retrieve = await runEcp(["retrieve", "--type", "capability", "--query", "ping", "--json"], {
      env,
    })
    expect(retrieve.code).toBe(0)
    const envelope = parseJsonStdout<{ data: { items: Array<{ id: string }> } }>(retrieve.stdout)
    expect(envelope.data.items.some((item) => item.id.includes("ping"))).toBe(true)
  }, 180_000)
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
