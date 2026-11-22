import { createRequire } from "node:module"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { ArtifactStore, PluginAdapter, ScratchSpace } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { LocalArtifactStore, LocalPluginRegistration, LocalScratchSpace } from "../src/index.js"

/** Plugin adapter tests need artifact and scratch services registered. */
function withFileServices<T extends ReturnType<typeof createEnvironment>>(env: T): T {
  return env.use(LocalArtifactStore, ArtifactStore).use(LocalScratchSpace, ScratchSpace) as T
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const pluginTestRoot = path.join(repoRoot, "plugins/plugin-test")
const requireFromSdk = createRequire(path.join(repoRoot, "packages/plugin-sdk/package.json"))
const zodPackageDir = path.dirname(requireFromSdk.resolve("zod/package.json"))
const zodUrl = pathToFileURL(path.join(zodPackageDir, "index.js")).href
const sdkUrl = pathToFileURL(path.join(repoRoot, "packages/plugin-sdk/dist/index.js")).href

async function writeLinkedPlugin(root: string, throwsOnHandlerImport: boolean): Promise<void> {
  await mkdir(path.join(root, "dist/capabilities"), { recursive: true })
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "@executioncontrolprotocol/linked",
        version: "1.0.0",
        type: "module",
        ecp: { manifest: "./ecp.manifest.json" },
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(root, "dist/index.js"),
    `
import { capability, definePlugin } from ${JSON.stringify(sdkUrl)};
import { z } from ${JSON.stringify(zodUrl)};
export default definePlugin({
  id: "@executioncontrolprotocol/linked",
  summary: "Linked.",
  description: "Linked test plugin.",
  capabilities: {
    ping: capability({
      summary: "Ping.",
      description: "Returns pong.",
      useCases: ["Ping"],
      projections: ["Take pong"],
      accepts: z.object({}),
      returns: z.object({ pong: z.boolean() }),
      handler: () => import("./capabilities/ping.js"),
    }),
  },
});
`,
  )
  await writeFile(
    path.join(root, "dist/capabilities/ping.js"),
    throwsOnHandlerImport
      ? `throw new Error("handler module imported too early");\n`
      : `export default async function handler() { return { pong: true }; }\n`,
  )
}

describe("LocalPluginRegistration", () => {
  let expression: QuickJsExpressionEngine
  let tempRoot: string

  beforeAll(async () => {
    expression = new QuickJsExpressionEngine()
    await expression.start()
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-plugins-"))
  })

  afterAll(async () => {
    await expression.stop?.()
  })

  it("registers plugin-test from manifests without importing handlers until first call", async () => {
    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [pluginTestRoot] } })
      .start({ home: "/tmp/ecp" })

    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(true)
    expect(adapter.plugins()[0]?.loaded).toBe(false)
    expect(adapter.capabilities().some((item) => item.id.endsWith(".echo"))).toBe(true)

    const result = await adapter.call(
      {
        capabilityId: "@executioncontrolprotocol/test.echo",
        input: { value: "hi" },
        config: undefined,
        context: { runId: "run-1", stepId: "echo", state: {} },
      },
      new AbortController().signal,
    )
    expect(result).toEqual({ echo: "hi" })
    expect(adapter.plugins()[0]?.loaded).toBe(true)

    const again = await adapter.call(
      {
        capabilityId: "@executioncontrolprotocol/test.echo",
        input: { value: "again" },
        config: undefined,
        context: { runId: "run-1", stepId: "echo", state: {} },
      },
      new AbortController().signal,
    )
    expect(again).toEqual({ echo: "again" })
    await host.stop()
  })

  it("regenerates linked manifests without importing handler modules", async () => {
    const linkedRoot = path.join(tempRoot, "linked")
    await writeLinkedPlugin(linkedRoot, true)

    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { linkedPlugins: [linkedRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    const linked = adapter.plugins().find((plugin) => plugin.source === "link")
    expect(linked?.issues ?? [], JSON.stringify(linked)).toEqual([])
    expect(linked?.manifestOk).toBe(true)
    expect(adapter.capabilities().map((item) => item.id)).toContain("@executioncontrolprotocol/linked.ping")
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/linked.ping",
          input: {},
          config: undefined,
          context: { runId: "run-2", stepId: "ping", state: {} },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "ECP_PLUGIN_LOAD_FAILED" })
    await host.stop()
  })

  it("marks version-mismatched plugins without blocking start", async () => {
    const badRoot = path.join(tempRoot, "bad")
    await mkdir(badRoot, { recursive: true })
    const schemaDocument = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ecp://plugins/@executioncontrolprotocol/bad/1.0.0/schema.json",
      $defs: {
        "ping.accepts": { type: "object" },
        "ping.returns": { type: "object" },
      },
    }
    await writeFile(
      path.join(badRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/bad",
        version: "9.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(badRoot, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/bad",
          package: "@executioncontrolprotocol/bad",
          version: "1.0.0",
          summary: "Bad.",
          description: "Version mismatch.",
        },
        sdkVersion: "fixture.sdk",
        pluginSchema: { path: "./ecp.schema.json", hash: "a".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/bad.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    await writeFile(path.join(badRoot, "ecp.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`)

    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [badRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(false)
    expect(adapter.capabilities()).toEqual([])
    await host.stop()
  })

  it("ignores a duplicate install of bundled core", async () => {
    const coreRoot = path.resolve(repoRoot, "plugins/plugin-core")
    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, {
        options: { extraPlugins: [coreRoot], linkedPlugins: [coreRoot] },
      })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    const plugins = adapter.plugins()
    const coreRows = plugins.filter((row) => row.id === "@executioncontrolprotocol/core")
    expect(coreRows.some((row) => row.manifestOk)).toBe(true)
    expect(coreRows.some((row) => row.manifestOk === false && row.issues?.[0]?.message.includes("ignored"))).toBe(
      true,
    )
    expect(adapter.capabilities().filter((row) => row.id.endsWith(".transform"))).toHaveLength(1)
    await host.stop()
  })

  it("detects duplicate capability ids across plugins", async () => {
    const dupRoot = path.join(tempRoot, "dup")
    await mkdir(path.join(dupRoot, "dist"), { recursive: true })
    const { canonicalJson, sha256Hex } = await import("@executioncontrolprotocol/plugin-sdk")
    const schemaDocument = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ecp://plugins/@executioncontrolprotocol/dup/1.0.0/schema.json",
      $defs: {
        "echo.accepts": { type: "object" },
        "echo.returns": { type: "object" },
      },
    }
    const schemaHash = await sha256Hex(canonicalJson(schemaDocument))
    await writeFile(
      path.join(dupRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/dup",
        version: "1.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(dupRoot, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/dup",
          package: "@executioncontrolprotocol/dup",
          version: "1.0.0",
          summary: "Dup.",
          description: "Duplicates echo.",
        },
        sdkVersion: "fixture.sdk",
        pluginSchema: { path: "./ecp.schema.json", hash: schemaHash },
        capabilities: [
          {
            id: "@executioncontrolprotocol/test.echo",
            name: "echo",
            summary: "Echo.",
            description: "Dup echo.",
            useCases: ["Echo"],
            projections: ["Echo"],
          },
        ],
        entry: "./dist/index.js",
        hash: "d".repeat(64),
      }),
    )
    await writeFile(path.join(dupRoot, "ecp.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`)

    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, {
        options: { extraPlugins: [pluginTestRoot, dupRoot] },
      })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    const plugins = adapter.plugins()
    expect(plugins.some((plugin) => plugin.manifestOk)).toBe(true)
    expect(plugins.some((plugin) => plugin.manifestOk === false)).toBe(true)
    await host.stop()
  })

  it("keeps listing light and loads accepts/returns via loadPluginSchema", async () => {
    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [pluginTestRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    const echo = adapter.capabilities().find((item) => item.id.endsWith(".echo"))
    expect(echo?.accepts).toBeUndefined()
    expect(echo?.returns).toBeUndefined()
    expect(adapter.schemaFingerprints().some((item) => item.pluginId === "@executioncontrolprotocol/test")).toBe(true)
    const schema = await adapter.loadPluginSchema("@executioncontrolprotocol/test")
    expect(schema?.$defs["echo.accepts"]).toMatchObject({ type: "object" })
    expect(schema?.$defs["echo.returns"]).toMatchObject({ type: "object" })
    expect(adapter.configSchema("@executioncontrolprotocol/test")).toMatchObject({ type: "object" })
    expect(await adapter.loadPluginSchema("@missing/plugin")).toBeUndefined()
    await host.stop()
  })

  it("marks plugins with a bad schema document as not ok on first schema load", async () => {
    const badSchemaRoot = path.join(tempRoot, "bad-schema")
    await mkdir(badSchemaRoot, { recursive: true })
    await writeFile(
      path.join(badSchemaRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/bad-schema",
        version: "1.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(badSchemaRoot, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/bad-schema",
          package: "@executioncontrolprotocol/bad-schema",
          version: "1.0.0",
          summary: "Bad schema.",
          description: "Bad schema.",
        },
        sdkVersion: "fixture.sdk",
        pluginSchema: { path: "./ecp.schema.json", hash: "a".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/bad-schema.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    await writeFile(
      path.join(badSchemaRoot, "ecp.schema.json"),
      JSON.stringify({
        $id: "ecp://plugins/@executioncontrolprotocol/bad-schema/1.0.0/schema.json",
        $defs: { only: { type: "string" } },
      }),
    )
    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [badSchemaRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(true)
    expect(adapter.capabilities().map((item) => item.id)).toContain("@executioncontrolprotocol/bad-schema.ping")
    expect(await adapter.loadPluginSchema("@executioncontrolprotocol/bad-schema")).toBeUndefined()
    expect(adapter.plugins()[0]?.manifestOk).toBe(false)
    expect(adapter.plugins()[0]?.issues?.[0]?.suggestions).toContain("Run ecp-plugin-manifest to regenerate.")
    await host.stop()
  })

  it("marks missing manifests without blocking start", async () => {
    const missingRoot = path.join(tempRoot, "missing")
    await mkdir(missingRoot, { recursive: true })
    await writeFile(
      path.join(missingRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/missing",
        version: "1.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [missingRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(false)
    expect(adapter.plugins()[0]?.issues?.[0]?.code).toBe("ECP_PLUGIN_LOAD_FAILED")
    await host.stop()
  })

  it("exercises delay abort, staged writes, files, usage and nested call through the real plugin", async () => {
    const samplePath = path.join(tempRoot, "in.bin")
    await writeFile(samplePath, Buffer.from([1, 2, 3, 4]))

    const home = path.join(tempRoot, "ecp-home")
    await mkdir(path.join(home, "runs", "run-3", "artifacts"), { recursive: true })

    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, {
        options: {
          extraPlugins: [pluginTestRoot],
        },
      })
      .start({ home })
    const adapter = host.services.get(PluginAdapter)

    const controller = new AbortController()
    let abortReason: unknown
    const pending = adapter
      .call(
        {
          capabilityId: "@executioncontrolprotocol/test.delay",
          input: { ms: 5000 },
          config: undefined,
          context: { runId: "run-3", stepId: "wait", state: {} },
        },
        controller.signal,
      )
      .catch((error: unknown) => {
        abortReason = error
      })
    controller.abort()
    await pending
    expect(abortReason).toMatchObject({ name: "AbortError" })

    const staged: Array<{ op: string; path: string; value: unknown }> = []
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.stage",
          input: { handle: { $state: "history" }, op: "append", value: "note" },
          config: undefined,
          context: { runId: "run-3", stepId: "stage", state: {} },
          store: {
            set(handle, value) {
              staged.push({ op: "set", path: handle.path, value })
            },
            merge(handle, value) {
              staged.push({ op: "merge", path: handle.path, value })
            },
            append(handle, value) {
              staged.push({ op: "append", path: handle.path, value })
            },
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ ok: true })
    expect(staged).toEqual([{ op: "append", path: "history", value: "note" }])

    const round = await adapter.call(
      {
        capabilityId: "@executioncontrolprotocol/test.file-roundtrip",
        input: { file: { kind: "file", path: samplePath } },
        config: undefined,
        context: { runId: "run-3", stepId: "files", state: {} },
      },
      new AbortController().signal,
    )
    expect(round).toMatchObject({
      artifact: { kind: "artifact", uri: expect.stringContaining("ecp://runs/run-3/artifacts/") },
    })

    const usage: Array<{ kind: string; amount: number; unit: string }> = []
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.echo",
          input: { value: "usage" },
          config: undefined,
          context: { runId: "run-3", stepId: "echo-usage", state: {} },
          usage: {
            record(entry) {
              usage.push(entry)
            },
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ echo: "usage" })
    // echo does not record usage; nested call path covers the sink wiring below via call capability
    expect(usage).toEqual([])

    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.call",
          input: { capabilityId: "@executioncontrolprotocol/test.echo", input: { value: "nested" } },
          config: undefined,
          context: { runId: "run-3", stepId: "call", state: {} },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ result: { echo: "nested" } })

    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.call",
          input: { capabilityId: "@executioncontrolprotocol/test.missing", input: {} },
          config: undefined,
          context: { runId: "run-3", stepId: "call", state: {} },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "ECP_CAPABILITY_UNKNOWN" })

    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.delay",
          input: { ms: "nope" },
          config: undefined,
          context: { runId: "run-3", stepId: "bad-input", state: {} },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })

    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.call",
          input: {
            capabilityId: "@executioncontrolprotocol/test.echo",
            input: { value: "x" },
            config: "missing-config",
          },
          config: undefined,
          context: { runId: "run-3", stepId: "nested-config", state: {} },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "ECP_CONFIG_NOT_FOUND" })

    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/test.config-echo",
          input: {},
          config: { secret: "abc", label: "lab" },
          context: { runId: "run-3", stepId: "config", state: {} },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ keys: ["secret", "label"], secretLength: 3 })

    expect(adapter.configSchema("@executioncontrolprotocol/test")).toMatchObject({ type: "object" })
    expect(adapter.configSchema("@executioncontrolprotocol/missing")).toBeUndefined()
    expect(adapter.configSchema("@executioncontrolprotocol/test")).toMatchObject({
      type: "object",
    })

    await host.stop()
  })

  it("forwards handler logger calls to the host logger", async () => {
    const linkedRoot = path.join(tempRoot, "logger-plugin")
    await mkdir(path.join(linkedRoot, "dist/capabilities"), { recursive: true })
    await writeFile(
      path.join(linkedRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/logger",
        version: "1.0.0",
        type: "module",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(linkedRoot, "dist/index.js"),
      `
import { capability, definePlugin } from ${JSON.stringify(sdkUrl)};
import { z } from ${JSON.stringify(zodUrl)};
export default definePlugin({
  id: "@executioncontrolprotocol/logger",
  summary: "Logger.",
  description: "Logs from a handler.",
  capabilities: {
    shout: capability({
      summary: "Shout.",
      description: "Logs and returns.",
      useCases: ["Log"],
      projections: ["Take ok"],
      accepts: z.object({}),
      returns: z.object({ ok: z.boolean() }),
      handler: () => import("./capabilities/shout.js"),
    }),
  },
});
`,
    )
    await writeFile(
      path.join(linkedRoot, "dist/capabilities/shout.js"),
      `
export default async function handler(_input, ctx) {
  ctx.logger.debug("d");
  ctx.logger.info("i");
  ctx.logger.warn("w");
  ctx.logger.error("e");
  return { ok: true };
}
`,
    )

    const host = await withFileServices(createEnvironment())
      .use(LocalPluginRegistration, PluginAdapter, { options: { linkedPlugins: [linkedRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    await expect(
      adapter.call(
        {
          capabilityId: "@executioncontrolprotocol/logger.shout",
          input: {},
          config: undefined,
          context: { runId: "run-log", stepId: "shout", state: {} },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ ok: true })
    await host.stop()
  })
})
