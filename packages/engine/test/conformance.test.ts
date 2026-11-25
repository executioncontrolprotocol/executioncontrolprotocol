import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import type {
  CapabilityEntry,
  ConfigObject,
  ExecutionManifest,
  PluginManifest,
  PluginSchemaDocument,
} from "@executioncontrolprotocol/protocol"
import {
  ExpressionEngine,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import {
  createEnvironment,
  generateEditorRootSchema,
  HostSchemaSet,
  loadExecutionText,
  validateExecution,
  type ServiceClass,
} from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const manifests = path.join(root, "fixtures", "manifests")
const runsDir = path.join(manifests, "runs")

function capabilitiesOf(manifestFile: string): CapabilityEntry[] {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as PluginManifest
  const schemaFile = path.join(path.dirname(manifestFile), "ecp.schema.json")
  const schemaDocument = JSON.parse(readFileSync(schemaFile, "utf8")) as PluginSchemaDocument
  const configSchema = schemaDocument.$defs.config
  return manifest.capabilities.map((capability) => ({
    id: capability.id,
    plugin: manifest.plugin.id,
    package: manifest.plugin.package,
    pluginVersion: manifest.plugin.version,
    summary: capability.summary,
    description: capability.description,
    useCases: capability.useCases,
    projections: capability.projections,
    accepts: schemaDocument.$defs[`${capability.name}.accepts`],
    returns: schemaDocument.$defs[`${capability.name}.returns`],
    configSchema,
    timeoutMs: capability.timeoutMs,
    ...(capability.contract ? { contract: capability.contract } : {}),
    ...(capability.code ? { code: capability.code } : {}),
  }))
}

const testPlugin = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest
const testPluginSchema = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument
const testCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"))
const creativeCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-creative/ecp.manifest.json"))
const corePluginManifestPath = path.join(root, "plugins/plugin-core/ecp.manifest.json")
const coreCapabilities = capabilitiesOf(corePluginManifestPath)
const corePlugin = JSON.parse(readFileSync(corePluginManifestPath, "utf8")) as PluginManifest
const corePluginSchema = JSON.parse(
  readFileSync(path.join(root, "plugins/plugin-core/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument

const anthropicConfig: ConfigObject = {
  schema: "@executioncontrolprotocol.config",
  version: "1.0",
  id: "anthropic/default",
  plugin: "@executioncontrolprotocol/anthropic",
  values: {},
  objectVersion: 1,
  updatedAt: "2026-11-14T00:00:00.000Z",
}

function readText(absolutePath: string): Promise<string> {
  return Promise.resolve(readFileSync(absolutePath, "utf8"))
}

function bind<T>(id: string, instance: T): ServiceClass<T> {
  return class {
    static readonly id = id
    constructor() {
      return instance as object & T
    }
  } as ServiceClass<T>
}

function fixtureHandlers(): ConstructorParameters<typeof FixturePluginAdapter>[1] {
  return {
    "@executioncontrolprotocol/test.echo": async (input) => {
      const value = (input as { value?: unknown; badOutput?: boolean }).value
      if ((input as { badOutput?: boolean }).badOutput) return undefined
      return { echo: value === undefined ? "hi" : value }
    },
    "@executioncontrolprotocol/test.fail": async (input) => {
      throw Object.assign(new Error(String((input as { message?: string }).message ?? "failed")), {
        code: (input as { code?: string }).code ?? "ECP_STEP_FAILED",
      })
    },
    "@executioncontrolprotocol/test.delay": async (input, ctx) => {
      const ms = Number((input as { ms: number }).ms)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms)
        ctx.signal.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
        })
      })
      return { waitedMs: ms }
    },
    "@executioncontrolprotocol/test.stage": async (input, ctx) => {
      const body = input as { handle: { $state?: string }; op?: string; value: unknown; fail?: boolean }
      const target = { path: body.handle.$state ?? "history" }
      if (!ctx.store) throw new Error("store required")
      if (body.op === "set") ctx.store.set(target, body.value)
      else if (body.op === "merge") ctx.store.merge(target, { extra: body.value })
      else ctx.store.append(target, body.value)
      if (body.fail === true) throw Object.assign(new Error("stage failed"), { code: "ECP_STEP_FAILED" })
      return { ok: true }
    },
    "@executioncontrolprotocol/test.bounded": async (input) => ({ text: (input as { text: string }).text }),
    "@executioncontrolprotocol/test.config-echo": async (_input, ctx) => {
      const secret = typeof ctx.config?.secret === "string" ? ctx.config.secret : ""
      return { keys: Object.keys(ctx.config ?? {}), secretLength: secret.length, echoed: ctx.config?.secret }
    },
  }
}

const creativePlugin = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-creative/ecp.manifest.json"), "utf8"),
) as PluginManifest
const creativePluginSchema = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-creative/ecp.schema.json"), "utf8"),
) as PluginSchemaDocument

describe("manifest conformance", () => {
  it.skip("accepts every valid fixture until graph-model fixtures land", { timeout: 30_000 }, async () => {
    const dir = path.join(manifests, "valid")
    const capabilities = [...testCapabilities, ...creativeCapabilities, ...coreCapabilities]
    const loadPluginSchema = async (pluginId: string) => {
      if (pluginId === testPlugin.plugin.id || pluginId === testPlugin.plugin.package) return testPluginSchema
      if (pluginId === creativePlugin.plugin.id || pluginId === creativePlugin.plugin.package) {
        return creativePluginSchema
      }
      if (pluginId === corePlugin.plugin.id || pluginId === corePlugin.plugin.package) {
        return corePluginSchema
      }
      return undefined
    }
    const schemaFingerprints = [
      {
        pluginId: testPlugin.plugin.id,
        version: testPlugin.plugin.version,
        hash: testPlugin.pluginSchema.hash,
      },
      {
        pluginId: creativePlugin.plugin.id,
        version: creativePlugin.plugin.version,
        hash: creativePlugin.pluginSchema.hash,
      },
      {
        pluginId: corePlugin.plugin.id,
        version: corePlugin.plugin.version,
        hash: corePlugin.pluginSchema.hash,
      },
    ]
    const schemaSet = await HostSchemaSet.create(capabilities, { loadPluginSchema, schemaFingerprints })
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown
      const serialized = JSON.stringify(manifest)
      if (
        serialized.includes('"type": "branch"') ||
        serialized.includes('"branches"') ||
        serialized.includes('"collect"') ||
        (serialized.includes('"expr"') && serialized.includes('"uses"')) ||
        (serialized.includes('"type": "loop"') && !serialized.includes('"end"'))
      ) {
        continue
      }
      const result = await validateExecution(manifest, {
        capabilities,
        configs: [anthropicConfig],
        loadPluginSchema,
        schemaFingerprints,
        schemaSet,
        executionDir: dir,
        readText,
      })
      expect(result.issues.filter((issue) => issue.severity === "error"), name).toEqual([])
    }
  })

  it.skip("matches the expected issues for every invalid fixture until graph-model fixtures land", { timeout: 30_000 }, async (ctx) => {
    const dir = path.join(manifests, "invalid")
    const remaining = readdirSync(dir).filter(
      (file) =>
        file.endsWith(".ecp.json") &&
        !readFileSync(path.join(dir, file), "utf8").includes('"type": "branch"') &&
        !readFileSync(path.join(dir, file), "utf8").includes('"branches"') &&
        !readFileSync(path.join(dir, file), "utf8").includes('"collect"'),
    )
    if (remaining.length === 0) ctx.skip()
    const loadPluginSchema = async (pluginId: string) => {
      if (pluginId === testPlugin.plugin.id || pluginId === testPlugin.plugin.package) return testPluginSchema
      return undefined
    }
    const schemaFingerprints = [
      {
        pluginId: testPlugin.plugin.id,
        version: testPlugin.plugin.version,
        hash: testPlugin.pluginSchema.hash,
      },
    ]
    for (const name of remaining) {
      const filePath = path.join(dir, name)
      const text = readFileSync(filePath, "utf8")
      const expected = JSON.parse(readFileSync(path.join(dir, name.replace(/\.ecp\.json$/, ".expected.json")), "utf8")) as Array<{
        code: string
        path: string
        severity: string
        messageIncludes?: string
        suggestionsIncludes?: string[]
      }>
      const result =
        name === "not-json.ecp.json"
          ? { valid: false, issues: loadExecutionText(text).issues, manifestHash: "", schemaHash: "" }
          : await validateExecution(JSON.parse(text) as unknown, {
              capabilities: testCapabilities,
              loadPluginSchema,
              schemaFingerprints,
              executionDir: dir,
              readText,
            })
      const actual = result.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        severity: issue.severity,
        message: issue.message,
        suggestions: issue.suggestions,
      }))
      for (const row of actual) {
        expect(typeof row.path, `${name} path type`).toBe("string")
      }
      expect(
        actual.map(({ code, path: issuePath, severity }) => ({ code, path: issuePath, severity })),
        name,
      ).toEqual(expected.map(({ code, path: issuePath, severity }) => ({ code, path: issuePath, severity })))
      for (const issue of expected) {
        const match = actual.find(
          (row) => row.code === issue.code && row.path === issue.path && row.severity === issue.severity,
        )
        if (issue.messageIncludes) {
          expect(match?.message, `${name} ${issue.code} ${issue.path}`).toContain(issue.messageIncludes)
        }
        if (issue.suggestionsIncludes) {
          for (const suggestion of issue.suggestionsIncludes) {
            expect(match?.suggestions ?? [], `${name} ${issue.code} ${issue.path}`).toContain(suggestion)
          }
        }
      }
      const keys = actual.map((row) => `${row.code}|${row.path}|${row.message}|${row.severity}`)
      expect(new Set(keys).size, `${name} duplicate issues`).toBe(keys.length)
    }
  })

  it("accepts localize-banner against the base document schema and rejects an invalid pointer", async (ctx) => {
    if (readFileSync(path.join(manifests, "valid/localize-banner.ecp.json"), "utf8").includes('"type": "branch"')) {
      ctx.skip()
    }
    const schema = generateEditorRootSchema([...testCapabilities, ...creativeCapabilities])
    const schemas = await HostSchemaSet.create([...testCapabilities, ...creativeCapabilities])
    const localize = JSON.parse(
      readFileSync(path.join(manifests, "valid/localize-banner.ecp.json"), "utf8"),
    ) as unknown
    expect(schemas.validateDocument(localize)).toEqual([])
    expect(schema).toMatchObject({ type: "object" })
    expect(JSON.stringify(schema)).toContain(".editor.schema.json#/$defs/")

    const invalidName = readdirSync(path.join(manifests, "invalid")).find((file) => file.endsWith(".ecp.json"))
    expect(invalidName).toBeTypeOf("string")
    const invalid = JSON.parse(readFileSync(path.join(manifests, "invalid", invalidName!), "utf8")) as unknown
    const expected = JSON.parse(
      readFileSync(path.join(manifests, "invalid", invalidName!.replace(/\.ecp\.json$/, ".expected.json")), "utf8"),
    ) as Array<{ code: string; path: string }>
    const result = await validateExecution(invalid, {
      capabilities: testCapabilities,
      loadPluginSchema: async (pluginId) =>
        pluginId === testPlugin.plugin.id || pluginId === testPlugin.plugin.package ? testPluginSchema : undefined,
      schemaFingerprints: [
        {
          pluginId: testPlugin.plugin.id,
          version: testPlugin.plugin.version,
          hash: testPlugin.pluginSchema.hash,
        },
      ],
    })
    const first = expected[0]
    expect(result.issues.some((issue) => issue.code === first?.code && issue.path === first.path)).toBe(true)
  })
})

describe("run conformance through execute", () => {
  let expression: QuickJsExpressionEngine

  beforeAll(async () => {
    expression = new QuickJsExpressionEngine()
    await expression.start()
  })

  it("matches status, result, step statuses and event type order", async () => {
    const storage = new MemoryStorage()
    const secrets = new MemorySecrets()
    const plugins = new FixturePluginAdapter(testPlugin, fixtureHandlers(), testPluginSchema)
    const host = await createEnvironment()
      .use(bind(MemoryStorage.id, storage), StorageProvider)
      .use(bind(MemorySecrets.id, secrets), SecretsProvider)
      .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
      .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
      .start({ home: "/tmp/ecp" })

    for (const name of readdirSync(runsDir).filter((file) => file.endsWith(".ecp.json"))) {
      const execution = JSON.parse(readFileSync(path.join(runsDir, name), "utf8")) as ExecutionManifest
      const serialized = JSON.stringify(execution)
      if (
        serialized.includes('"type": "branch"') ||
        serialized.includes('"branches"') ||
        serialized.includes('"collect"') ||
        (serialized.includes('"expr"') && serialized.includes('"uses"')) ||
        (serialized.includes('"type": "loop"') && !serialized.includes('"end"'))
      ) {
        continue
      }
      const expected = JSON.parse(readFileSync(path.join(runsDir, name.replace(/\.ecp\.json$/, ".run.json")), "utf8")) as {
        input: Record<string, unknown>
        status: string
        result: Record<string, unknown>
        steps: Array<{ nodeId: string; status: string; round?: number }>
        events: string[]
      }
      const response = await host.operations.execute({ execution, input: expected.input })
      expect(response.ok, name).toBe(true)
      if (!response.ok || !("status" in response.data)) continue
      expect(response.data.status, name).toBe(expected.status)
      expect(response.data.result, name).toEqual(expected.result)
      expect(
        response.data.steps.map(({ durationMs: _durationMs, ...step }) => step),
        name,
      ).toEqual(expected.steps)
      const detail = await storage.runs.get(response.data.runId, ["events"])
      expect(
        detail?.events?.map((event) => event.type),
        name,
      ).toEqual(expected.events)
    }

    await host.stop()
  })
})
