import { spawn } from "node:child_process"
import { mkdirSync, readdirSync } from "node:fs"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  callTool,
  createCliHome,
  fileUrlForLocalPath,
  minimalPluginRoot,
  openMcpSession,
  pluginTestRoot,
  runEcp,
  waitForHost,
} from "./support.js"

describe("A6 supervisor drain, force interrupt, resume", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("delay in progress + plugins install drains/restarts; retrieve without reconnect", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(async () => {
      await session.close()
    })

    const started = await callTool(session.client, "execute", {
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            input: { ms: 12_000 },
            as: "done",
          },
        ],
      },
      wait: false,
    })
    expect(started.isError).toBeUndefined()
    const runId = (started.structuredContent as { runId?: string }).runId
    expect(runId).toBeTruthy()

    await delay(400)
    const mid = await callTool(session.client, "retrieve", { type: "run", id: runId! })
    const midStatus =
      (mid.structuredContent as { item?: { status?: string } })?.item?.status ??
      (mid.structuredContent as { status?: string }).status
    expect(midStatus).toBe("running")

    // Pack + install a second fixture plugin while the delay runs (triggers drain/restart).
    // Hand-written link fixtures lack definePlugin dist; install loads ecp.manifest.json.
    const packDir = path.join(home, "pack")
    mkdirSync(packDir, { recursive: true })
    const tarball = await packDirectory(minimalPluginRoot, packDir)
    const install = await runEcp(["plugins", "install", fileUrlForLocalPath(tarball)], {
      env,
      timeoutMs: 180_000,
    })
    expect(install.code, install.stderr + install.stdout).toBe(0)
    await waitForHost(home)

    let found = false
    let lastBlob = ""
    for (let i = 0; i < 50; i++) {
      const after = await callTool(session.client, "retrieve", {
        type: "capability",
        query: "ping",
      })
      lastBlob = JSON.stringify(after.structuredContent ?? after.text)
      if (lastBlob.includes("ping") || lastBlob.includes("minimal-fixture")) {
        found = true
        break
      }
      await delay(500)
    }
    expect(found, lastBlob).toBe(true)

    let terminal = false
    for (let i = 0; i < 50; i++) {
      const run = await callTool(session.client, "retrieve", { type: "run", id: runId! })
      const status =
        (run.structuredContent as { item?: { status?: string } })?.item?.status ??
        (run.structuredContent as { status?: string }).status
      if (status && status !== "running") {
        terminal = true
        expect(["completed", "interrupted", "failed", "cancelled"]).toContain(status)
        break
      }
      await delay(500)
    }
    expect(terminal).toBe(true)
  }, 300_000)

  it("--force mid-delay → interrupted → execute { resume } completes", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    void pluginTestRoot
    const session = await openMcpSession({ env })
    cleanups.push(async () => {
      await session.close()
    })

    const started = await callTool(session.client, "execute", {
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            input: { ms: 25_000 },
            as: "done",
          },
        ],
      },
      wait: false,
    })
    expect(started.isError).toBeUndefined()
    const runId = (started.structuredContent as { runId?: string }).runId
    expect(runId).toBeTruthy()
    await delay(400)

    const restart = await runEcp(["host", "restart", "--force", "--json"], { env })
    expect(restart.code).toBe(0)
    await waitForHost(home)

    let status: string | undefined
    for (let i = 0; i < 30; i++) {
      const interrupted = await callTool(session.client, "retrieve", { type: "run", id: runId! })
      status =
        (interrupted.structuredContent as { item?: { status?: string } })?.item?.status ??
        (interrupted.structuredContent as { status?: string }).status
      if (status && status !== "running") break
      await delay(300)
    }
    expect(status).toBe("interrupted")

    const resumed = await callTool(session.client, "execute", { resume: runId! })
    expect(resumed.isError).toBeUndefined()
    const resumeStatus = (resumed.structuredContent as { status?: string }).status
    expect(resumeStatus).toBe("completed")
  }, 240_000)
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
