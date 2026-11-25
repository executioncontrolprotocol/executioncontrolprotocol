import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import type { ExecutionManifest, PluginManifest, PluginSchemaDocument } from "@executioncontrolprotocol/protocol"
import { ExpressionEngine, Formatter as FormatterToken, PluginAdapter, SecretsProvider, StorageProvider } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { LocalStorage } from "../../local/src/storage/storage.js"
import { manifestExecutionText } from "../../local/src/storage/execution-files.js"
import { createEnvironment, type ServiceClass } from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"
import { readFileSync as readFixture } from "node:fs"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const pluginManifest = JSON.parse(
  readFixture(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest
const pluginSchema = JSON.parse(
  readFixture(path.join(root, "fixtures/plugins/fixture-plugin/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument

const echo: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "echo", label: "Echo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" }, as: "echo" }],
}

const detachedAside: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [{ id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "keep" }, as: "keep" }],
  detached: [{ id: "aside", uses: "@executioncontrolprotocol/test.echo", input: { value: "aside" }, as: "aside" }],
}

function handlers() {
  return {
    "@executioncontrolprotocol/test.echo": async (input: unknown) => {
      const value = (input as { value?: unknown }).value
      return { echo: value === undefined ? "hi" : value }
    },
  }
}

function bind<T>(id: string, instance: T): ServiceClass<T> {
  return class {
    static readonly id = id
    constructor() {
      return instance as object & T
    }
  } as ServiceClass<T>
}

const jsonFormatter = {
  id: "@executioncontrolprotocol/formatters.json",
  mediaType: "application/json",
  format(value: unknown) {
    return JSON.stringify(value)
  },
}

async function startLocalHost(home: string) {
  const plugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
  const expression = new QuickJsExpressionEngine()
  await expression.start()
  const host = await createEnvironment()
    .use(LocalStorage, StorageProvider)
    .use(bind(MemorySecrets.id, new MemorySecrets()), SecretsProvider)
    .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
    .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
    .use(bind(jsonFormatter.id, jsonFormatter), FormatterToken, { default: true })
    .start({ home })
  const storage = host.services.get(StorageProvider)
  return { host, storage, home, expression }
}

async function startMemoryHost() {
  const storage = new MemoryStorage({
    read: async (filePath) => readFileSync(filePath, "utf8"),
  })
  const plugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
  const expression = new QuickJsExpressionEngine()
  await expression.start()
  const host = await createEnvironment()
    .use(bind(MemoryStorage.id, storage), StorageProvider)
    .use(bind(MemorySecrets.id, new MemorySecrets()), SecretsProvider)
    .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
    .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
    .use(bind(jsonFormatter.id, jsonFormatter), FormatterToken, { default: true })
    .start({ home: "/tmp/ecp-mem" })
  return { host, storage, expression }
}

describe("path-addressed retrieve and commit", () => {
  let tmpdir: string
  let execFile: string

  beforeAll(() => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), "ecp-path-"))
    execFile = path.join(tmpdir, "flow.ecp.json")
    writeFileSync(execFile, manifestExecutionText(echo))
  })

  it("refuses scripts on delete and integer ifVersion with path on create", async () => {
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: execFile })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const scriptsDelete = await host.operations.commit({
      type: "execution",
      action: "delete",
      path: execFile,
      ifVersion: version,
      scripts: { "x.js": "y" },
    })
    expect(scriptsDelete.ok).toBe(false)
    const intPath = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: 1,
      object: echo,
    })
    expect(intPath.ok).toBe(false)
    await host.stop()
  })

  it("covers additional retrieve and commit refusals", async () => {
    const { host } = await startLocalHost(tmpdir)
    const combo = await host.operations.retrieve({ type: "execution", filter: { dir: tmpdir }, query: "x" })
    expect(combo.ok).toBe(false)
    const missing = await host.operations.retrieve({
      type: "execution",
      path: path.join(tmpdir, "missing.ecp.json"),
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe("ECP_NOT_FOUND")
    const badSuffix = await host.operations.commit({
      type: "execution",
      action: "delete",
      path: path.join(tmpdir, "nope.json"),
      ifVersion: "1",
    })
    expect(badSuffix.ok).toBe(false)
    await host.stop()
  })

  it("refuses non-ecp paths and invalid JSON files", async () => {
    const { host } = await startLocalHost(tmpdir)
    const badSuffix = await host.operations.retrieve({ type: "execution", path: path.join(tmpdir, "x.json") })
    expect(badSuffix.ok).toBe(false)
    const badJson = path.join(tmpdir, "bad.ecp.json")
    writeFileSync(badJson, "{")
    const loadFail = await host.operations.retrieve({ type: "execution", path: badJson })
    expect(loadFail.ok).toBe(false)
    if (!loadFail.ok) expect(loadFail.error.code).toBe("ECP_EXECUTION_LOAD")
    const listScripts = await host.operations.retrieve({
      type: "execution",
      filter: { dir: tmpdir },
      include: ["scripts"],
    })
    expect(listScripts.ok).toBe(false)
    await host.stop()
  })

  it("round-trips retrieve by path", async () => {
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: execFile })
    expect(got.ok).toBe(true)
    if (!got.ok || !("item" in got.data)) throw new Error("expected item")
    const item = got.data.item as { id?: string; path?: string; version: string; issues: unknown[]; warnings: unknown[] }
    expect(item.path).toBe(execFile)
    expect(item.id).toBeUndefined()
    expect(typeof item.version).toBe("string")
    expect(item.version).toHaveLength(64)
    expect(item.issues).toBeDefined()
    expect(item.warnings).toBeDefined()
    await host.stop()
  })

  it("updates by path with string ifVersion and preserves key order", async () => {
    const { host } = await startLocalHost(tmpdir)
    const first = await host.operations.retrieve({ type: "execution", path: execFile })
    if (!first.ok || !("item" in first.data)) throw new Error("retrieve")
    const version = (first.data.item as { version: string }).version
    const reordered = {
      version: "2.0" as const,
      schema: "@executioncontrolprotocol.execution" as const,
      steps: echo.steps,
      execution: { id: "echo", label: "Echo updated" },
    }
    const updated = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: version,
      object: reordered,
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error("commit")
    expect(typeof updated.data.version).toBe("string")
    const onDisk = readFileSync(execFile, "utf8")
    expect(onDisk.startsWith('{\n  "version"')).toBe(true)
    expect(onDisk).toContain('"schema"')
    const second = await host.operations.retrieve({ type: "execution", path: execFile })
    if (!second.ok || !("item" in second.data)) throw new Error("second retrieve")
    expect((second.data.item as { version: string }).version).toBe(updated.data.version)
    await host.stop()
  })

  it("refuses stale string ifVersion", async () => {
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: execFile })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const stale = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: "deadbeef".padEnd(64, "0"),
      object: echo,
    })
    expect(stale.ok).toBe(false)
    if (stale.ok || !stale.error) throw new Error("expected conflict")
    expect(stale.error.code).toBe("ECP_VERSION_CONFLICT")
    expect(stale.error.message).toContain(version.slice(0, 8))
    const okAgain = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: version,
      object: echo,
    })
    expect(okAgain.ok).toBe(true)
    await host.stop()
  })

  it("keeps strict path commit refusing L2 errors", async () => {
    const strictPath = path.join(tmpdir, "strict.ecp.json")
    writeFileSync(strictPath, manifestExecutionText(echo))
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: strictPath })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const strict = await host.operations.commit({
      type: "execution",
      action: "update",
      path: strictPath,
      ifVersion: version,
      object: detachedAside,
    })
    expect(strict.ok).toBe(false)
    if (!strict.ok) expect(strict.error.code).toBe("ECP_MANIFEST_INVALID")
    await host.stop()
  })

  it("stores draft with L2 detached errors and refuses execute", async () => {
    const draftPath = path.join(tmpdir, "draft.ecp.json")
    writeFileSync(draftPath, manifestExecutionText(echo))
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: draftPath })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const committed = await host.operations.commit({
      type: "execution",
      action: "update",
      path: draftPath,
      ifVersion: version,
      draft: true,
      object: detachedAside,
    })
    expect(committed.ok).toBe(true)
    if (!committed.ok) throw new Error("draft commit")
    expect(committed.data.issues?.some((issue) => issue.code === "ECP_NODE_DETACHED")).toBe(true)
    const run = await host.operations.execute({ execution: { path: draftPath }, mode: "validate" })
    expect(run.ok).toBe(false)
    await host.stop()
  })

  it("refuses path on memory storage", async () => {
    const { host } = await startMemoryHost()
    const got = await host.operations.retrieve({ type: "execution", path: execFile })
    expect(got.ok).toBe(false)
    if (got.ok) throw new Error("expected refuse")
    expect(got.error.code).toBe("ECP_REQUEST_INVALID")
    const list = await host.operations.retrieve({ type: "execution", filter: { dir: tmpdir } })
    expect(list.ok).toBe(false)
    const commitPath = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: "abc",
      object: echo,
    })
    expect(commitPath.ok).toBe(false)
    await host.stop()
  })

  it("deletes a path-addressed file", async () => {
    const delDir = mkdtempSync(path.join(os.tmpdir(), "ecp-del-"))
    const exec = path.join(delDir, "gone.ecp.json")
    writeFileSync(exec, manifestExecutionText(echo))
    const { host } = await startLocalHost(delDir)
    const got = await host.operations.retrieve({ type: "execution", path: exec })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const deleted = await host.operations.commit({
      type: "execution",
      action: "delete",
      path: exec,
      ifVersion: version,
    })
    expect(deleted.ok).toBe(true)
    const missing = await host.operations.retrieve({ type: "execution", path: exec })
    expect(missing.ok).toBe(false)
    await host.stop()
  })

  it("writes script files on path commit", async () => {
    const scriptDir = path.join(tmpdir, "scripts-case")
    mkdirSync(scriptDir, { recursive: true })
    const exec = path.join(scriptDir, "main.ecp.json")
    writeFileSync(exec, manifestExecutionText(echo))
    const { host } = await startLocalHost(tmpdir)
    const first = await host.operations.retrieve({ type: "execution", path: exec })
    if (!first.ok || !("item" in first.data)) throw new Error("retrieve")
    const version = (first.data.item as { version: string }).version
    const committed = await host.operations.commit({
      type: "execution",
      action: "update",
      path: exec,
      ifVersion: version,
      object: echo,
      scripts: { "helper.js": "export const ok = true\n" },
    })
    expect(committed.ok).toBe(true)
    expect(readFileSync(path.join(scriptDir, "helper.js"), "utf8")).toContain("ok")
    await host.stop()
  })

  it("rejects include scripts on run retrieve and both id and path", async () => {
    const { host } = await startMemoryHost()
    const runBad = await host.operations.retrieve({ type: "run", id: "x", include: ["scripts"] })
    expect(runBad.ok).toBe(false)
    const both = await host.operations.retrieve({ type: "execution", id: "a", path: execFile })
    expect(both.ok).toBe(false)
    const configDir = await host.operations.retrieve({ type: "config", filter: { dir: tmpdir } })
    expect(configDir.ok).toBe(false)
    await host.stop()
  })

  it("refuses read-only commit types", async () => {
    const { host } = await startMemoryHost()
    const bad = await host.operations.commit({ type: "capability" as never, action: "create" })
    expect(bad.ok).toBe(false)
    await host.stop()
  })

  it("refuses id with filter.dir", async () => {
    const { host } = await startLocalHost(tmpdir)
    const bad = await host.operations.retrieve({ type: "execution", id: "x", filter: { dir: tmpdir } })
    expect(bad.ok).toBe(false)
    await host.stop()
  })

  it("requires id or path on execution delete", async () => {
    const { host } = await startMemoryHost()
    const del = await host.operations.commit({ type: "execution", action: "delete", ifVersion: 1 })
    const upd = await host.operations.commit({ type: "execution", action: "update", ifVersion: 1, object: echo })
    expect(del.ok).toBe(false)
    expect(upd.ok).toBe(false)
    await host.stop()
  })

  it("refuses path update without body", async () => {
    const { host } = await startLocalHost(tmpdir)
    const got = await host.operations.retrieve({ type: "execution", path: execFile })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const bad = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: version,
    })
    expect(bad.ok).toBe(false)
    const both = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: version,
      object: echo,
      patch: [{ op: "replace", path: "/execution/label", value: "x" }],
    })
    expect(both.ok).toBe(false)
    await host.stop()
  })

  it("returns issues on draft create when clean", async () => {
    const { host } = await startMemoryHost()
    const created = await host.operations.commit({
      type: "execution",
      action: "create",
      id: "draft-ok",
      draft: true,
      object: echo,
    })
    expect(created.ok).toBe(true)
    if (created.ok) expect(created.data.issues).toBeDefined()
    await host.stop()
  })

  it("refuses L0 draft commit and updates by patch", async () => {
    const patchDir = mkdtempSync(path.join(os.tmpdir(), "ecp-patch-"))
    const exec = path.join(patchDir, "patch.ecp.json")
    writeFileSync(exec, manifestExecutionText(echo))
    const { host } = await startLocalHost(patchDir)
    const got = await host.operations.retrieve({ type: "execution", path: exec })
    if (!got.ok || !("item" in got.data)) throw new Error("retrieve")
    const version = (got.data.item as { version: string }).version
    const l0 = await host.operations.commit({
      type: "execution",
      action: "create",
      draft: true,
      object: { schema: "wrong", version: "2.0", steps: echo.steps },
    })
    expect(l0.ok).toBe(false)
    const patched = await host.operations.commit({
      type: "execution",
      action: "update",
      path: exec,
      ifVersion: version,
      patch: [{ op: "replace", path: "/execution/label", value: "Patched" }],
    })
    expect(patched.ok).toBe(true)
    await host.stop()
  })

  it("refuses draft on config and unknown capability", async () => {
    const { host, storage } = await startMemoryHost()
    const config = {
      schema: "@executioncontrolprotocol.config",
      version: "1.0",
      id: "test/default",
      plugin: "@executioncontrolprotocol/test",
      values: {},
      objectVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    await storage.putConfig(config, { create: true })
    const stringVer = await host.operations.commit({
      type: "config",
      action: "update",
      id: config.id,
      ifVersion: "1",
      object: config,
    })
    expect(stringVer.ok).toBe(false)
    const bad = await host.operations.commit({
      type: "config",
      action: "create",
      draft: true,
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/x",
        plugin: "@executioncontrolprotocol/test",
        values: {},
        objectVersion: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    })
    expect(bad.ok).toBe(false)
    await storage.putExecution("del", echo, { create: true })
    const draftDel = await host.operations.commit({
      type: "execution",
      action: "delete",
      id: "del",
      ifVersion: 1,
      draft: true,
    })
    expect(draftDel.ok).toBe(false)
    const l1 = await host.operations.commit({
      type: "execution",
      action: "create",
      draft: true,
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "x", uses: "@missing/cap", input: {}, as: "x" }],
      },
    })
    expect(l1.ok).toBe(false)
    await host.stop()
  })

  it("refuses scripts on stored id commit", async () => {
    const { host, storage } = await startMemoryHost()
    await storage.putExecution("stored", echo, { create: true })
    const bad = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "stored",
      ifVersion: 1,
      object: echo,
      scripts: { "a.js": "x" },
    })
    expect(bad.ok).toBe(false)
    await host.stop()
  })

  it("refuses create with path and mixed id versions", async () => {
    const { host } = await startMemoryHost()
    const create = await host.operations.commit({
      type: "execution",
      action: "create",
      path: execFile,
      object: echo,
    })
    expect(create.ok).toBe(false)
    const badId = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "x",
      ifVersion: "1",
      object: echo,
    })
    expect(badId.ok).toBe(false)
    const badPath = await host.operations.commit({
      type: "execution",
      action: "update",
      path: execFile,
      ifVersion: 1,
      object: echo,
    })
    expect(badPath.ok).toBe(false)
    await host.stop()
  })
})

describe("filter.dir listing", () => {
  it("caps scan at 200 and applies retrieve limit", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ecp-cap-"))
    for (let i = 0; i < 205; i++) {
      writeFileSync(path.join(root, `f${i}.ecp.json`), manifestExecutionText(echo))
    }
    const { host } = await startLocalHost(root)
    const listed = await host.operations.retrieve({ type: "execution", filter: { dir: root }, limit: 5 })
    expect(listed.ok).toBe(true)
    if (!listed.ok || !("items" in listed.data)) throw new Error("list")
    expect(listed.data.total).toBe(200)
    expect(listed.data.items).toHaveLength(5)
    await host.stop()
  })

  it("lists nested executions and skips hidden dirs", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ecp-dir-"))
    const nested = path.join(root, "pkg", "flows")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, "one.ecp.json"), manifestExecutionText(echo))
    mkdirSync(path.join(root, ".hidden"), { recursive: true })
    writeFileSync(path.join(root, ".hidden", "skip.ecp.json"), manifestExecutionText(echo))
    mkdirSync(path.join(root, "node_modules"), { recursive: true })
    writeFileSync(path.join(root, "node_modules", "skip.ecp.json"), manifestExecutionText(echo))
    const { host } = await startLocalHost(root)
    const listed = await host.operations.retrieve({ type: "execution", filter: { dir: root } })
    expect(listed.ok).toBe(true)
    if (!listed.ok || !("items" in listed.data)) throw new Error("list")
    const items = listed.data.items as Array<{ path: string; version: string }>
    expect(items.some((row) => row.path.endsWith("one.ecp.json"))).toBe(true)
    expect(items.every((row) => typeof row.version === "string")).toBe(true)
    await host.stop()
  })
})