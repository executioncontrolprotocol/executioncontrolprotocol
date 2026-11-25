import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  awaitTestDelay,
  holdDelayForTests,
  releaseDelayForTests,
  resetDelayForTests,
} from "../../../plugins/plugin-test/src/capabilities/delay-hooks.js"
import type {
  ExecutionManifest,
  Formatter,
  PluginManifest,
  PluginSchemaDocument,
  ServiceToken,
} from "@executioncontrolprotocol/protocol"
import {
  ExpressionEngine,
  Formatter as FormatterToken,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { createEnvironment, createOperations, type ServiceClass, type ServiceLookup } from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const pluginManifest = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest
const pluginSchema = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument

const echo: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "echo", label: "Echo run" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" }, as: "echo" }],
}

const jsonFormatter: Formatter & { id: string } = {
  id: "@executioncontrolprotocol/formatters.json",
  mediaType: "application/json",
  format(value) {
    return JSON.stringify(value)
  },
}

const textFormatter: Formatter & { id: string } = {
  id: "@executioncontrolprotocol/formatters.text",
  mediaType: "text/plain",
  format(value) {
    return String((value as { type?: string }).type ?? "ok")
  },
}

function handlers(): ConstructorParameters<typeof FixturePluginAdapter>[1] {
  return {
    "@executioncontrolprotocol/test.echo": async (input) => {
      const value = (input as { value?: unknown }).value
      return { echo: value === undefined ? "hi" : value }
    },
    "@executioncontrolprotocol/test.delay": async (input, ctx) => {
      const typed = input as { ms: number; hold?: boolean }
      await awaitTestDelay(typed.ms, ctx.signal, typed.hold)
      return { waitedMs: typed.ms }
    },
    "@executioncontrolprotocol/test.fail": async (input) => {
      throw Object.assign(new Error(String((input as { message?: string }).message ?? "failed")), {
        code: (input as { code?: string }).code ?? "ECP_STEP_FAILED",
      })
    },
  }
}

afterEach(() => {
  resetDelayForTests()
})

function bind<T>(id: string, instance: T): ServiceClass<T> {
  return class {
    static readonly id = id
    constructor() {
      return instance as object & T
    }
  } as ServiceClass<T>
}

async function startHost(files?: { read: (path: string) => Promise<string> }) {
  const storage = new MemoryStorage(files)
  const secrets = new MemorySecrets()
  const plugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
  const expression = new QuickJsExpressionEngine()
  await expression.start()
  const written = new Map<string, string>()
  const host = await createEnvironment()
    .use(bind(MemoryStorage.id, storage), StorageProvider)
    .use(bind(MemorySecrets.id, secrets), SecretsProvider)
    .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
    .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
    .use(bind(jsonFormatter.id, jsonFormatter), FormatterToken, { default: true })
    .use(bind(textFormatter.id, textFormatter), FormatterToken)
    .start({
      home: "/tmp/ecp",
      writeTextFile: async (filePath, text) => {
        written.set(filePath, text)
      },
    })
  return { host, storage, secrets, plugins, written, expression }
}

describe("operations", () => {
  let expression: QuickJsExpressionEngine

  beforeAll(async () => {
    expression = new QuickJsExpressionEngine()
    await expression.start()
  })

  it("retrieves by id, query, list, format and output.path", async () => {
    const { host, storage, written } = await startHost()
    await storage.putExecution("echo", echo, { create: true })
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: "test.secret" } },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
      { create: true },
    )

    const byId = await host.operations.retrieve({ type: "capability", id: "@executioncontrolprotocol/test.echo" })
    expect(byId.ok).toBe(true)
    if (byId.ok) expect(byId.data).toMatchObject({ type: "capability", item: { id: "@executioncontrolprotocol/test.echo" } })

    const missing = await host.operations.retrieve({ type: "capability", id: "@executioncontrolprotocol/test.ech" })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.suggestions?.length).toBeGreaterThan(0)

    const query = await host.operations.retrieve({ type: "capability", query: "echo", limit: 5 })
    expect(query.ok).toBe(true)
    if (query.ok && "items" in query.data) expect(query.data.items.length).toBeGreaterThan(0)

    const executions = await host.operations.retrieve({ type: "execution", query: "echo" })
    expect(executions.ok).toBe(true)

    const formatted = await host.operations.retrieve({
      type: "plugin",
      format: "@executioncontrolprotocol/formatters.json",
      output: { path: "/tmp/out.json" },
    })
    expect(formatted.ok).toBe(true)
    if (formatted.ok && "written" in formatted.data) {
      expect(formatted.data.written.path).toBe("/tmp/out.json")
      expect(written.get("/tmp/out.json")).toContain("@executioncontrolprotocol/test")
    }

    const configs = await host.operations.retrieve({ type: "config", id: "test/default" })
    expect(configs.ok).toBe(true)
    await host.stop()
  })

  it(
    "validates, runs, dedups clientRequestId, patches, cancels and resumes",
    { timeout: 20_000 },
    async () => {
    const { host, storage } = await startHost({
      read: async (filePath) => {
        if (filePath.endsWith("echo.ecp.json")) return JSON.stringify(echo)
        throw Object.assign(new Error("missing"), { code: "ECP_NOT_FOUND" })
      },
    })
    await storage.putExecution("echo", echo, { create: true })

    const invalid = await host.operations.execute({
      execution: { ...echo, steps: [] },
      mode: "validate",
    })
    expect(invalid.ok).toBe(false)

    const validated = await host.operations.execute({ execution: echo, mode: "validate", input: {} })
    expect(validated.ok).toBe(true)

    const ran = await host.operations.execute({
      execution: { id: "echo" },
      input: {},
      clientRequestId: "req-1",
    })
    expect(ran.ok).toBe(true)
    if (ran.ok && "runId" in ran.data) {
      expect(ran.data.status).toBe("completed")
      expect(ran.data.result).toEqual({ echo: { echo: "hi" } })
      const again = await host.operations.execute({
        execution: { id: "echo" },
        input: {},
        clientRequestId: "req-1",
      })
      expect(again.ok).toBe(true)
      if (again.ok && "runId" in again.data) expect(again.data.runId).toBe(ran.data.runId)
    }

    const patched = await host.operations.execute({
      execution: {
        id: "echo",
        patch: [{ op: "replace", path: "/steps/@echo/input/value", value: "patched" }],
      },
      input: {},
    })
    expect(patched.ok).toBe(true)
    if (patched.ok && "result" in patched.data) expect(patched.data.result).toEqual({ echo: { echo: "patched" } })

    const fromPath = await host.operations.execute({ execution: { path: "/tmp/echo.ecp.json" }, input: {} })
    expect(fromPath.ok).toBe(true)

    const waiting = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "wait", uses: "@executioncontrolprotocol/test.delay", input: { ms: 5000 }, as: "wait" }],
      },
      wait: false,
    })
    expect(waiting.ok).toBe(true)
    if (waiting.ok && "runId" in waiting.data) {
      expect(waiting.data.status).toBe("running")
      const cancelled = await host.operations.execute({ cancel: waiting.data.runId })
      expect(cancelled.ok).toBe(true)
      if (cancelled.ok && "status" in cancelled.data) expect(cancelled.data.status).toBe("cancelled")
    }

    const interruptRun = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          { id: "first", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "first" },
          { id: "wait", uses: "@executioncontrolprotocol/test.delay", input: { ms: 5000 }, as: "wait" },
        ],
      },
      wait: false,
    })
    expect(interruptRun.ok).toBe(true)
    if (interruptRun.ok && "runId" in interruptRun.data) {
      await expect
        .poll(
          async () => {
            const run = await host.operations.retrieve({ type: "run", id: interruptRun.data.runId! })
            if (!run.ok) return undefined
            const status =
              "item" in run.data && run.data.item && typeof run.data.item === "object" && "status" in run.data.item
                ? (run.data.item as { status?: string }).status
                : undefined
            return status === "running" ? true : undefined
          },
          { timeout: 5_000 },
        )
        .toBe(true)
      const detail = await storage.runs.get(interruptRun.data.runId, ["state"])
      await storage.runs.update(interruptRun.data.runId, {
        status: "interrupted",
        cursor: { completed: ["first"], inProgress: "wait", loops: {}, branches: {} },
      })
      const resumed = await host.operations.execute({ resume: interruptRun.data.runId })
      expect(resumed.ok).toBe(true)
      if (resumed.ok && "status" in resumed.data) {
        expect(["completed", "cancelled", "failed", "interrupted"]).toContain(resumed.data.status)
      }
      expect(detail).toBeDefined()
    }

    await host.stop()
  })

  it("commits executions and configs with ifVersion rules", async () => {
    const { host } = await startHost()
    const created = await host.operations.commit({
      type: "execution",
      action: "create",
      object: echo,
    })
    expect(created.ok).toBe(true)
    if (created.ok) expect(created.data.version).toBe(1)

    const conflict = await host.operations.commit({
      type: "execution",
      action: "create",
      object: echo,
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error.code).toBe("ECP_ALREADY_EXISTS")

    const updated = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "echo",
      ifVersion: 1,
      patch: [{ op: "replace", path: "/execution/label", value: "Echo v2" }],
    })
    expect(updated.ok).toBe(true)
    if (updated.ok) expect(updated.data.version).toBe(2)

    const stale = await host.operations.commit({
      type: "execution",
      action: "update",
      id: "echo",
      ifVersion: 1,
      object: echo,
    })
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.error.code).toBe("ECP_VERSION_CONFLICT")

    const missingVersion = await host.operations.commit({
      type: "execution",
      action: "delete",
      id: "echo",
    })
    expect(missingVersion.ok).toBe(false)
    if (!missingVersion.ok) expect(missingVersion.error.code).toBe("ECP_REQUEST_INVALID")

    const config = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: "k" }, label: "x" },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    })
    expect(config.ok).toBe(true)

    const missingPlugin = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "other/default",
        plugin: "@executioncontrolprotocol/missing",
        values: {},
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    })
    expect(missingPlugin.ok).toBe(false)
    if (!missingPlugin.ok) expect(missingPlugin.error.code).toBe("ECP_PLUGINS_MISSING")

    const deleted = await host.operations.commit({
      type: "execution",
      action: "delete",
      id: "echo",
      ifVersion: 2,
    })
    expect(deleted.ok).toBe(true)
    if (deleted.ok) expect(deleted.data.version).toBeNull()

    await host.stop()
  },
  )

  it("createOperations works against a manual service lookup", () => {
    const storage = new MemoryStorage()
    const plugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
    const services: ServiceLookup = {
      get<T>(token: ServiceToken<T>) {
        if (token.id === StorageProvider.id) return storage as T
        if (token.id === PluginAdapter.id) return plugins as T
        if (token.id === ExpressionEngine.id) return expression as T
        if (token.id === SecretsProvider.id) return new MemorySecrets() as T
        throw new Error(`missing ${token.id}`)
      },
      getAll<T>(token: ServiceToken<T>) {
        if (token.id === FormatterToken.id) return [jsonFormatter] as T[]
        return [services.get(token)]
      },
      has(token) {
        return [StorageProvider.id, PluginAdapter.id, ExpressionEngine.id, SecretsProvider.id, FormatterToken.id].includes(
          token.id,
        )
      },
    }
    const ops = createOperations(services)
    expect(ops.retrieve).toBeTypeOf("function")
  })

  it("covers retrieve and execute edge paths", { timeout: 30_000 }, async () => {
    const { host, storage, written } = await startHost({
      read: async (filePath) => {
        if (filePath.endsWith("bad.ecp.json")) return "{ not json"
        if (filePath.endsWith("echo.ecp.json")) return JSON.stringify(echo)
        throw Object.assign(new Error("missing"), { code: "ECP_NOT_FOUND" })
      },
    })
    await storage.putExecution("echo", echo, { create: true })
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "x" },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
      { create: true },
    )

    expect((await host.operations.retrieve({ type: "capability", id: "x", query: "y" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "capability", limit: 0 })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "capability", limit: 1000 })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "execution", id: "echo" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "execution", id: "missing" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "execution" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "config", query: "test" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "config", id: "missing" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "config" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "plugin", id: "@executioncontrolprotocol/test" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "plugin", id: "nope" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "plugin" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "formatter", id: "@executioncontrolprotocol/formatters.json" })).ok).toBe(true)
    expect((await host.operations.retrieve({ type: "formatter", id: "missing" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "formatter" })).ok).toBe(true)

    const ran = await host.operations.execute({ execution: echo, input: {} })
    expect(ran.ok).toBe(true)
    if (ran.ok && "runId" in ran.data) {
      const record = await storage.runs.get(ran.data.runId)
      expect(record?.host.pid).toBeGreaterThan(0)
      expect(record?.host.pid).toBe(process.pid)
      expect(record?.host.mode).toBe("in-process")
      const withInclude = await host.operations.retrieve({
        type: "run",
        id: ran.data.runId,
        include: ["steps", "events", "state", "manifest"],
      })
      expect(withInclude.ok).toBe(true)
      const listed = await host.operations.retrieve({ type: "run", filter: { status: "completed" }, limit: 5 })
      expect(listed.ok).toBe(true)
      expect((await host.operations.retrieve({ type: "run", id: "missing" })).ok).toBe(false)
    }

    const jsonOut = await host.operations.retrieve({ type: "capability", output: { path: "/tmp/caps.json" } })
    expect(jsonOut.ok).toBe(true)
    expect(written.has("/tmp/caps.json")).toBe(true)

    expect((await host.operations.execute({ resume: "x", cancel: "y" })).ok).toBe(false)
    expect((await host.operations.execute({})).ok).toBe(false)
    expect((await host.operations.execute({ execution: { path: "/tmp/echo.txt" } })).ok).toBe(false)
    expect((await host.operations.execute({ execution: { path: "/tmp/bad.ecp.json" } })).ok).toBe(false)
    expect((await host.operations.execute({ resume: "missing" })).ok).toBe(false)
    expect((await host.operations.execute({ cancel: "missing" })).ok).toBe(false)

    if (ran.ok && "runId" in ran.data) {
      await storage.runs.update(ran.data.runId, { status: "completed" })
      expect((await host.operations.execute({ resume: ran.data.runId })).ok).toBe(false)
    }

    holdDelayForTests()
    const timed = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "wait", uses: "@executioncontrolprotocol/test.delay", input: { ms: 5000, hold: true }, as: "wait" }],
      },
      waitTimeoutMs: 20,
    })
    expect(timed.ok).toBe(true)
    if (timed.ok && "status" in timed.data) expect(timed.data.status).toBe("running")
    if (timed.ok && "runId" in timed.data) await host.operations.execute({ cancel: timed.data.runId })
    releaseDelayForTests()

    const withOut = await host.operations.execute({
      execution: echo,
      input: {},
      output: { path: "/tmp/run.json" },
    })
    expect(withOut.ok).toBe(true)
    expect(written.has("/tmp/run.json")).toBe(true)

    expect(
      (
        await host.operations.commit({
          type: "capability" as "execution",
          action: "create",
          object: echo,
        })
      ).ok,
    ).toBe(false)

    const configUpdate = await host.operations.commit({
      type: "config",
      action: "update",
      id: "test/default",
      ifVersion: 1,
      patch: [{ op: "replace", path: "/values/label", value: "y" }],
    })
    expect(configUpdate.ok).toBe(true)

    const configReplace = await host.operations.commit({
      type: "config",
      action: "update",
      id: "test/default",
      ifVersion: 2,
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "z" },
        objectVersion: 2,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    })
    expect(configReplace.ok).toBe(true)

    await host.operations.commit({ type: "config", action: "delete", id: "test/default", ifVersion: 3 })

    const formatted = await host.operations.retrieve({ type: "plugin", format: "formatter-1" })
    expect(formatted.ok).toBe(true)
    if (formatted.ok && "text" in formatted.data) expect(formatted.data.text).toBe("plugin")

    const formattedOut = await host.operations.retrieve({
      type: "plugin",
      format: "formatter-1",
      output: { path: "/tmp/plugins.txt" },
    })
    expect(formattedOut.ok).toBe(true)
    expect(written.get("/tmp/plugins.txt")).toBe("plugin")

    expect((await host.operations.retrieve({ type: "plugin", format: "missing-format" })).ok).toBe(false)
    expect((await host.operations.retrieve({ type: "formatter", id: "formatter-1" })).ok).toBe(true)

    const noWriter = await createEnvironment()
      .use(bind(MemoryStorage.id, storage), StorageProvider)
      .use(bind(MemorySecrets.id, new MemorySecrets()), SecretsProvider)
      .use(bind(FixturePluginAdapter.id, new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)), PluginAdapter)
      .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
      .use(bind(jsonFormatter.id, jsonFormatter), FormatterToken, { default: true })
      .start({ home: "/tmp/ecp" })
    expect((await noWriter.operations.retrieve({ type: "plugin", output: { path: "/tmp/x.json" } })).ok).toBe(false)
    expect(
      (await noWriter.operations.execute({ execution: echo, input: {}, output: { path: "/tmp/y.json" } })).ok,
    ).toBe(false)
    await noWriter.stop()

    expect(
      (
        await host.operations.commit({
          type: "execution",
          action: "create",
          object: { hello: true },
        })
      ).ok,
    ).toBe(false)
    expect(
      (
        await host.operations.commit({
          type: "execution",
          action: "update",
          id: "echo",
          ifVersion: 1,
          object: echo,
          patch: [{ op: "replace", path: "/execution/label", value: "x" }],
        })
      ).ok,
    ).toBe(false)
    expect(
      (
        await host.operations.commit({
          type: "config",
          action: "create",
          object: { schema: "@executioncontrolprotocol.config", id: "x" },
        })
      ).ok,
    ).toBe(false)

    const badConfigType = await host.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/bad",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: 1 },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    })
    expect(badConfigType.ok).toBe(false)

    const requiredPlugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
    requiredPlugins.configSchema = () => ({
      type: "object",
      required: ["secret"],
      properties: { secret: { type: "string" }, label: { type: "string" } },
    })
    const requiredHost = await createEnvironment()
      .use(bind(MemoryStorage.id, new MemoryStorage()), StorageProvider)
      .use(bind(FixturePluginAdapter.id, requiredPlugins), PluginAdapter)
      .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
      .start({ home: "/tmp/ecp" })
    const missingRequired = await requiredHost.operations.commit({
      type: "config",
      action: "create",
      object: {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/required",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "x" },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
    })
    expect(missingRequired.ok).toBe(false)
    await requiredHost.stop()

    const skipped = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "gate",
            uses: "@executioncontrolprotocol/test.echo",
            expr: "(state) => false",
            input: { value: "x" },
            as: "gate",
          },
        ],
      },
      input: {},
    })
    expect(skipped.ok).toBe(true)
    if (skipped.ok && "steps" in skipped.data) expect(skipped.data.steps[0]?.status).toBe("skipped")

    await host.stop()
  })

  it("loads stored configs when validating execute and commit", async () => {
    const { host, storage } = await startHost()
    await storage.putConfig(
      {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { label: "lab" },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
      { create: true },
    )

    const missing = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "cfg",
            uses: "@executioncontrolprotocol/test.echo",
            config: "test/missing",
            input: { value: "x" },
            as: "out",
          },
        ],
      },
      mode: "validate",
      input: {},
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.issues?.some((issue) => issue.code === "ECP_CONFIG_UNKNOWN")).toBe(true)

    const known = await host.operations.execute({
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "cfg",
            uses: "@executioncontrolprotocol/test.echo",
            config: "test/default",
            input: { value: "x" },
            as: "out",
          },
        ],
      },
      mode: "validate",
      input: {},
    })
    expect(known.ok).toBe(true)

    const committed = await host.operations.commit({
      type: "execution",
      action: "create",
      id: "with-config",
      object: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "with-config" },
        steps: [
          {
            id: "cfg",
            uses: "@executioncontrolprotocol/test.echo",
            config: "test/default",
            input: { value: "x" },
            as: "out",
          },
        ],
      },
    })
    expect(committed.ok).toBe(true)

    await host.stop()
  })
})
