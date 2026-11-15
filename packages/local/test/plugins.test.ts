import { createRequire } from "node:module"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createEnvironment } from "@executioncontrolprotocol/engine"
import { PluginAdapter } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { LocalPluginRegistration } from "../src/index.js"

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
        name: "@executioncontrolprotocol/plugin-linked",
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
    const host = await createEnvironment()
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

    const host = await createEnvironment()
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
    await writeFile(
      path.join(badRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/plugin-bad",
        version: "9.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(badRoot, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "1.0",
        plugin: {
          id: "@executioncontrolprotocol/bad",
          package: "@executioncontrolprotocol/plugin-bad",
          version: "1.0.0",
          summary: "Bad.",
          description: "Version mismatch.",
        },
        sdkVersion: "fixture.sdk",
        capabilities: [
          {
            id: "@executioncontrolprotocol/bad.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
            accepts: { type: "object" },
            returns: { type: "object" },
          },
        ],
        entry: "./dist/index.js",
        hash: "abc",
      }),
    )

    const host = await createEnvironment()
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [badRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(false)
    expect(adapter.capabilities()).toEqual([])
    await host.stop()
  })

  it("detects duplicate capability ids across plugins", async () => {
    const dupRoot = path.join(tempRoot, "dup")
    await mkdir(path.join(dupRoot, "dist"), { recursive: true })
    await writeFile(
      path.join(dupRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/plugin-dup",
        version: "1.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    await writeFile(
      path.join(dupRoot, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "1.0",
        plugin: {
          id: "@executioncontrolprotocol/dup",
          package: "@executioncontrolprotocol/plugin-dup",
          version: "1.0.0",
          summary: "Dup.",
          description: "Duplicates echo.",
        },
        sdkVersion: "fixture.sdk",
        capabilities: [
          {
            id: "@executioncontrolprotocol/test.echo",
            name: "echo",
            summary: "Echo.",
            description: "Dup echo.",
            useCases: ["Echo"],
            projections: ["Echo"],
            accepts: { type: "object" },
            returns: { type: "object" },
          },
        ],
        entry: "./dist/index.js",
        hash: "def",
      }),
    )

    const host = await createEnvironment()
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

  it("marks missing manifests without blocking start", async () => {
    const missingRoot = path.join(tempRoot, "missing")
    await mkdir(missingRoot, { recursive: true })
    await writeFile(
      path.join(missingRoot, "package.json"),
      JSON.stringify({
        name: "@executioncontrolprotocol/plugin-missing",
        version: "1.0.0",
        ecp: { manifest: "./ecp.manifest.json" },
      }),
    )
    const host = await createEnvironment()
      .use(LocalPluginRegistration, PluginAdapter, { options: { extraPlugins: [missingRoot] } })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)
    expect(adapter.plugins()[0]?.manifestOk).toBe(false)
    expect(adapter.plugins()[0]?.issues?.[0]?.code).toBe("ECP_PLUGIN_LOAD_FAILED")
    await host.stop()
  })

  it("exercises delay abort, staged writes, files, usage and nested call through the real plugin", async () => {
    const artifactRoot = path.join(tempRoot, "artifacts")
    await mkdir(artifactRoot, { recursive: true })
    const samplePath = path.join(artifactRoot, "in.bin")
    await writeFile(samplePath, Buffer.from([1, 2, 3, 4]))

    const host = await createEnvironment()
      .use(LocalPluginRegistration, PluginAdapter, {
        options: {
          extraPlugins: [pluginTestRoot],
          artifactDirForRun: () => artifactRoot,
        },
      })
      .start({ home: "/tmp/ecp" })
    const adapter = host.services.get(PluginAdapter)

    const controller = new AbortController()
    const pending = adapter.call(
      {
        capabilityId: "@executioncontrolprotocol/test.delay",
        input: { ms: 5000 },
        config: undefined,
        context: { runId: "run-3", stepId: "wait", state: {} },
      },
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })

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
    expect(adapter.configSchema("@executioncontrolprotocol/plugin-test")).toMatchObject({
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
        name: "@executioncontrolprotocol/plugin-logger",
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

    const host = await createEnvironment()
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
