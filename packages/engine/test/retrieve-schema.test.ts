import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { EditorSchemaFileStat, EditorSchemaFiles, PluginManifest } from "@executioncontrolprotocol/protocol"
import {
  EditorSchemaFiles as EditorSchemaFilesToken,
  ExpressionEngine,
  PluginAdapter,
  SCHEMA_DOCUMENT_INLINE_MAX_BYTES,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { createEnvironment, createOperations, type ServiceClass } from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
function bind<T>(id: string, instance: T): ServiceClass<T> {
  return class {
    static readonly id = id
    constructor() {
      return instance as object & T
    }
  } as ServiceClass<T>
}

const pluginManifest = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest

class FakeEditorSchemaFiles implements EditorSchemaFiles {
  static readonly id = "@executioncontrolprotocol/test.editor-schema-files"
  ensureCalls = 0
  rootBytes = 100
  pluginBytes = 50
  rootExists = true
  pluginExists = true
  readonly rootPath = "/tmp/schema/execution.schema.json"
  readonly pluginPath = "/tmp/schema/plugins/test.editor.schema.json"
  rootDoc: Record<string, unknown> = { type: "object", title: "root" }

  async ensureCurrent(): Promise<void> {
    this.ensureCalls += 1
  }

  async stat(pluginId?: string): Promise<EditorSchemaFileStat> {
    if (!pluginId) {
      if (!this.rootExists) throw new Error("missing root")
      return { id: "root", path: this.rootPath, bytes: this.rootBytes }
    }
    if (!this.pluginExists) throw new Error("missing plugin file")
    return { id: pluginId, path: this.pluginPath, bytes: this.pluginBytes }
  }

  async read(): Promise<Record<string, unknown>> {
    return this.rootDoc
  }
}

async function startHost(fake: FakeEditorSchemaFiles) {
  const plugins = new FixturePluginAdapter(pluginManifest, {
    "@executioncontrolprotocol/test.echo": async (input) => ({ echo: (input as { value?: unknown }).value }),
  })
  const expression = new QuickJsExpressionEngine()
  await expression.start()
  const host = await createEnvironment()
    .use(bind(MemoryStorage.id, new MemoryStorage("/tmp/ecp-schema")), StorageProvider)
    .use(bind(MemorySecrets.id, new MemorySecrets()), SecretsProvider)
    .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
    .use(bind(FakeEditorSchemaFiles.id, fake), EditorSchemaFilesToken)
    .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
    .start({ home: "/tmp/ecp-schema" })
  return host
}

describe("retrieve type schema", () => {
  it("returns root path and optional document", async () => {
    const fake = new FakeEditorSchemaFiles()
    const host = await startHost(fake)
    const pathOnly = await host.operations.retrieve({ type: "schema" })
    expect(pathOnly.ok).toBe(true)
    if (!pathOnly.ok || !("item" in pathOnly.data)) throw new Error("expected item")
    const item = pathOnly.data.item as { id: string; path: string; bytes: number; document?: unknown }
    expect(item.id).toBe("root")
    expect(item.path).toContain("execution.schema.json")
    expect(item.document).toBeUndefined()
    expect(fake.ensureCalls).toBeGreaterThan(0)

    const withDoc = await host.operations.retrieve({ type: "schema", include: ["document"] })
    expect(withDoc.ok).toBe(true)
    if (!withDoc.ok || !("item" in withDoc.data)) throw new Error("expected item")
    expect((withDoc.data.item as { document: unknown }).document).toEqual(fake.rootDoc)
    await host.stop()
  })

  it("rejects query, unknown plugins, and oversize inline document", async () => {
    const fake = new FakeEditorSchemaFiles()
    fake.rootBytes = SCHEMA_DOCUMENT_INLINE_MAX_BYTES + 1
    const host = await startHost(fake)
    expect((await host.operations.retrieve({ type: "schema", query: "x" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "schema", id: "missing-plugin" })).ok).toBe(false)
    const tooBig = await host.operations.retrieve({ type: "schema", include: ["document"] })
    expect(tooBig.ok).toBe(false)
    if (!tooBig.ok) expect(tooBig.error.code).toBe("ECP_REQUEST_INVALID")

    const written = new Map<string, string>()
    const outPath = "/tmp/ecp-schema/out.json"
    const ops = createOperations(host.services, {
      settings: host.settings,
      writeTextFile: async (target, text) => {
        written.set(target, text)
      },
    })
    const withOut = await ops.retrieve({ type: "schema", include: ["document"], output: { path: outPath } })
    expect(withOut.ok).toBe(true)
    expect(written.has(outPath)).toBe(true)
    await host.stop()
  })

  it("fails without EditorSchemaFiles registered", async () => {
    const plugins = new FixturePluginAdapter(pluginManifest, {
      "@executioncontrolprotocol/test.echo": async () => ({}),
    })
    const expression = new QuickJsExpressionEngine()
    await expression.start()
    const host = await createEnvironment()
      .use(bind(MemoryStorage.id, new MemoryStorage("/tmp/ecp-schema-no-editor")), StorageProvider)
      .use(bind(MemorySecrets.id, new MemorySecrets()), SecretsProvider)
      .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
      .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
      .start({ home: "/tmp/ecp-schema-no-editor" })
    const missing = await host.operations.retrieve({ type: "schema" })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe("ECP_INTERNAL")
    await host.stop()
  })
})