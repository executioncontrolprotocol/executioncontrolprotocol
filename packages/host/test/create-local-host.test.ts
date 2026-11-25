import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { StorageProvider, type ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  checkHealth,
  createLocalHost,
  mergeCoreExtraPlugins,
  resolveBundledCorePluginRoot,
  VERSION,
} from "../src/index.js"

const pluginTestRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../plugins/plugin-test",
)

const tiny: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}

describe("createLocalHost", () => {
  it("prepends bundled core plugin root to extraPlugins", () => {
    const coreRoot = path.resolve(resolveBundledCorePluginRoot())
    const merged = mergeCoreExtraPlugins([pluginTestRoot])
    expect(merged[0]).toBe(coreRoot)
    expect(merged).toContain(pluginTestRoot)
    expect(mergeCoreExtraPlugins([coreRoot, pluginTestRoot])).toEqual([coreRoot, pluginTestRoot])
  })

  it("starts in-process, writes schema, and marks leftover runs interrupted", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-host-unit-"))
    const seed = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    await seed.services.get(StorageProvider).runs.create(
      {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "leftover",
        execution: { path: null, manifestHash: "h" },
        status: "running",
        input: {},
        result: null,
        error: null,
        startedAt: new Date(Date.now() - 1000).toISOString(),
        plugins: {},
        host: { version: VERSION, pid: 1, mode: "in-process" },
      },
      tiny,
    )
    await seed.stop()

    const host = await createLocalHost({
      home,
      mode: "in-process",
      extraPlugins: [pluginTestRoot],
    })
    expect(host.schemaHash).toMatch(/^[a-f0-9]{64}$/)
    expect(host.timing.schemaMs).toBeGreaterThanOrEqual(0)
    expect(existsSync(path.join(home, "schema", "execution.schema.json"))).toBe(true)
    const leftover = await host.services.get(StorageProvider).runs.get("leftover", ["events"])
    expect(leftover?.status).toBe("interrupted")
    expect(leftover?.events?.some((event) => event.type === "run.interrupted")).toBe(true)
    await host.stop()
  })

  it("starts server mode and serves health without a token", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ecp-host-server-"))
    const host = await createLocalHost({
      home,
      mode: "server",
      extraPlugins: [pluginTestRoot],
      logLevel: "debug",
      defaultStepTimeoutMs: 60_000,
      defaultMaxConcurrency: 2,
    })
    expect(host.token).toHaveLength(43)
    expect(host.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const health = await checkHealth(host.url!)
    expect(health?.status).toBe("ok")
    expect(health?.pid).toBe(process.pid)
    const out = path.join(home, "out.json")
    const written = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "x" },
            as: "out",
          },
        ],
      },
      output: { path: out },
    })
    expect(written.ok).toBe(true)
    expect(existsSync(out)).toBe(true)
    await host.stop()
  })
})
