import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { StorageProvider, type ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { createLocalHost } from "../src/index.js"

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
  it("rejects server mode until Phase 4", async () => {
    await expect(createLocalHost({ home: os.tmpdir(), mode: "server" })).rejects.toThrow(/Phase 4/)
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
        host: { version: "2.0.0", pid: 1 },
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
})
