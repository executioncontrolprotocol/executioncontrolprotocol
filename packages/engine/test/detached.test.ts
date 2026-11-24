import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type {
  CapabilityCall,
  CapabilityEntry,
  ExecutionManifest,
  Formatter,
  PluginManifest,
  PluginSchemaDocument,
} from "@executioncontrolprotocol/protocol"
import {
  ExpressionEngine,
  Formatter as FormatterToken,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import {
  createEnvironment,
  runExecution,
  validateExecution,
  type ServiceClass,
} from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const pluginManifest = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest
const pluginSchema = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument

const capabilities: CapabilityEntry[] = pluginManifest.capabilities.map((capability) => ({
  id: capability.id,
  plugin: pluginManifest.plugin.id,
  package: pluginManifest.plugin.package,
  pluginVersion: pluginManifest.plugin.version,
  summary: capability.summary,
  description: capability.description,
  useCases: capability.useCases,
  projections: capability.projections,
  accepts: pluginSchema.$defs[`${capability.name}.accepts`],
  returns: pluginSchema.$defs[`${capability.name}.returns`],
  configSchema: pluginSchema.$defs.config,
  timeoutMs: capability.timeoutMs,
}))

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

const detachedIssue = {
  code: "ECP_NODE_DETACHED" as const,
  path: "/detached/0",
  severity: "error" as const,
  message: "Step aside isn't connected to the flow",
  suggestions: ["Reconnect it or delete it"],
  nodeId: "aside",
}

const jsonFormatter: Formatter & { id: string } = {
  id: "@executioncontrolprotocol/formatters.json",
  mediaType: "application/json",
  format(value) {
    return JSON.stringify(value)
  },
}

function handlers(): ConstructorParameters<typeof FixturePluginAdapter>[1] {
  return {
    "@executioncontrolprotocol/test.echo": async (input) => {
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

async function startHost() {
  const storage = new MemoryStorage()
  const secrets = new MemorySecrets()
  const plugins = new FixturePluginAdapter(pluginManifest, handlers(), pluginSchema)
  const expression = new QuickJsExpressionEngine()
  await expression.start()
  const host = await createEnvironment()
    .use(bind(MemoryStorage.id, storage), StorageProvider)
    .use(bind(MemorySecrets.id, secrets), SecretsProvider)
    .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
    .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
    .use(bind(jsonFormatter.id, jsonFormatter), FormatterToken, { default: true })
    .start({ home: "/tmp/ecp" })
  return { host, storage, expression }
}

let engine: QuickJsExpressionEngine

beforeAll(async () => {
  engine = new QuickJsExpressionEngine()
  await engine.start()
})

describe("detached steps", () => {
  it("leaves manifests without detached valid and runnable", async () => {
    const result = await validateExecution(echo, { capabilities, expression: engine })
    expect(result.valid).toBe(true)
    expect(result.issues.some((issue) => issue.code === "ECP_NODE_DETACHED")).toBe(false)
    const { host } = await startHost()
    const ran = await host.operations.execute({ execution: echo, input: {} })
    expect(ran.ok).toBe(true)
    await host.stop()
  })

  it("refuses validate and run with ECP_NODE_DETACHED and creates no run", async () => {
    const { host, storage } = await startHost()
    const validated = await host.operations.execute({ execution: detachedAside, mode: "validate" })
    expect(validated.ok).toBe(false)
    if (!validated.ok) {
      expect(validated.error.code).toBe("ECP_MANIFEST_INVALID")
      expect(validated.error.issues).toEqual(expect.arrayContaining([expect.objectContaining(detachedIssue)]))
    }
    const ran = await host.operations.execute({ execution: detachedAside, input: {} })
    expect(ran.ok).toBe(false)
    expect(await storage.runs.list({}, 10)).toEqual([])
    await host.stop()
  })

  it("refuses strict commit and leaves storage empty", async () => {
    const { host, storage } = await startHost()
    const committed = await host.operations.commit({
      type: "execution",
      action: "create",
      object: { ...detachedAside, execution: { id: "detached-run" } },
    })
    expect(committed.ok).toBe(false)
    if (!committed.ok) {
      expect(committed.error.code).toBe("ECP_MANIFEST_INVALID")
      expect(committed.error.issues).toEqual(expect.arrayContaining([expect.objectContaining(detachedIssue)]))
    }
    expect(await storage.listExecutions()).toEqual([])
    await host.stop()
  })

  it("retrieve returns a stored manifest with detached unchanged", async () => {
    const { host, storage } = await startHost()
    await storage.putExecution("aside", detachedAside, { create: true })
    const got = await host.operations.retrieve({ type: "execution", id: "aside" })
    expect(got.ok).toBe(true)
    if (got.ok && "item" in got.data) {
      expect(got.data.item.manifest.detached).toEqual(detachedAside.detached)
    }
    await host.stop()
  })

  it("runExecution refuses before call and emits no events", async () => {
    const call = vi.fn(async (_request: CapabilityCall) => ({ echo: "x" }))
    const outcome = await runExecution(detachedAside, {}, { capabilities, call, expression: engine })
    expect(outcome.status).toBe("failed")
    expect(outcome.error).toMatchObject({ code: "ECP_NODE_DETACHED", path: "/detached/0" })
    expect(outcome.events).toEqual([])
    expect(outcome.steps).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it("reports duplicate ids on detached after steps", async () => {
    const manifest: ExecutionManifest = {
      ...detachedAside,
      detached: [{ id: "keep", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "dup" }],
    }
    const result = await validateExecution(manifest, { capabilities, expression: engine })
    expect(result.valid).toBe(false)
    const detached = result.issues.filter((issue) => issue.code === "ECP_NODE_DETACHED")
    expect(detached).toHaveLength(1)
    const duplicate = result.issues.find(
      (issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path === "/detached/0/id",
    )
    expect(duplicate?.message).toContain("already used at /steps/0")
    expect(result.issues.some((issue) => issue.path === "/steps/0/id" && issue.message.includes("already used"))).toBe(
      false,
    )
  })

  it("does not run L3 on detached-only $ref problems", async () => {
    const manifest: ExecutionManifest = {
      ...detachedAside,
      detached: [
        {
          id: "aside",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: "state.missing" } },
          as: "aside",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities, expression: engine })
    expect(result.issues.some((issue) => issue.code === "ECP_REF_UNRESOLVED")).toBe(false)
    expect(result.issues.some((issue) => issue.code === "ECP_NODE_DETACHED")).toBe(true)
  })

  it("uses the branch container id in the detached message", async () => {
    const manifest: ExecutionManifest = {
      ...detachedAside,
      detached: [
        {
          type: "branch",
          id: "route",
          branches: [
            { expr: "true", steps: [{ id: "arm", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "arm" }] },
          ],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities, expression: engine })
    const issue = result.issues.find((issue) => issue.code === "ECP_NODE_DETACHED")
    expect(issue).toMatchObject({ path: "/detached/0", message: "Step route isn't connected to the flow", nodeId: "route" })
  })

  it("rejects detached: [] at L1 without ECP_NODE_DETACHED", async () => {
    const manifest = { ...detachedAside, detached: [] as ExecutionManifest["detached"] }
    const result = await validateExecution(manifest, { capabilities, expression: engine })
    expect(result.issues.some((issue) => issue.code === "ECP_NODE_DETACHED")).toBe(false)
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path === "/detached")).toBe(true)
  })
})