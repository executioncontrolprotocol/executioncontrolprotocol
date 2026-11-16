import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import type { CapabilityEntry, ConfigObject, ExecutionManifest, PluginManifest } from "@executioncontrolprotocol/protocol"
import {
  ExpressionEngine,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import {
  createEnvironment,
  generateExecutionSchema,
  HostSchemaSet,
  validateExecution,
  type ServiceClass,
} from "../src/index.js"
import { FixturePluginAdapter, MemorySecrets, MemoryStorage } from "../src/testing/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const manifests = path.join(root, "fixtures", "manifests")
const runsDir = path.join(manifests, "runs")

function capabilitiesOf(file: string): CapabilityEntry[] {
  const manifest = JSON.parse(readFileSync(file, "utf8")) as PluginManifest
  return manifest.capabilities.map((capability) => ({
    id: capability.id,
    plugin: manifest.plugin.id,
    package: manifest.plugin.package,
    pluginVersion: manifest.plugin.version,
    summary: capability.summary,
    description: capability.description,
    useCases: capability.useCases,
    projections: capability.projections,
    accepts: capability.accepts,
    returns: capability.returns,
    configSchema: manifest.configSchema,
    timeoutMs: capability.timeoutMs,
  }))
}

const testPlugin = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest
const testCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"))
const creativeCapabilities = capabilitiesOf(path.join(root, "fixtures/plugins/fixture-creative/ecp.manifest.json"))

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

describe("manifest conformance", () => {
  it("accepts every valid fixture", async () => {
    const dir = path.join(manifests, "valid")
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown
      const result = await validateExecution(manifest, {
        capabilities: [...testCapabilities, ...creativeCapabilities],
        configs: [anthropicConfig],
        executionDir: dir,
        readText,
      })
      expect(result.issues.filter((issue) => issue.severity === "error"), name).toEqual([])
    }
    // Each validation recompiles the combined execution schema today (audit F7), so this is slow under
    // full-suite load. S3 of realignment/schema-scaling-plan.md removes that cost; then drop this timeout.
  }, 30_000)

  it("matches the expected issues for every invalid fixture", { timeout: 30_000 }, async () => {
    const dir = path.join(manifests, "invalid")
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown
      const expected = JSON.parse(readFileSync(path.join(dir, name.replace(/\.ecp\.json$/, ".expected.json")), "utf8")) as Array<{
        code: string
        path: string
        severity: string
      }>
      const result = await validateExecution(manifest, {
        capabilities: testCapabilities,
        executionDir: dir,
        readText,
      })
      const actual = result.issues.map((issue) => ({ code: issue.code, path: issue.path, severity: issue.severity }))
      for (const issue of expected) {
        expect(actual, `${name} missing ${issue.code} ${issue.path}`).toContainEqual(issue)
      }
    }
  })

  it("accepts localize-banner against the generated schema and rejects an invalid pointer", async () => {
    const schema = generateExecutionSchema([...testCapabilities, ...creativeCapabilities])
    const schemas = await HostSchemaSet.create([...testCapabilities, ...creativeCapabilities])
    const localize = JSON.parse(
      readFileSync(path.join(manifests, "valid/localize-banner.ecp.json"), "utf8"),
    ) as unknown
    expect(schemas.validateDocument(localize)).toEqual([])
    expect(schema).toMatchObject({ type: "object" })

    const invalidName = readdirSync(path.join(manifests, "invalid")).find((file) => file.endsWith(".ecp.json"))
    expect(invalidName).toBeTypeOf("string")
    const invalid = JSON.parse(readFileSync(path.join(manifests, "invalid", invalidName!), "utf8")) as unknown
    const expected = JSON.parse(
      readFileSync(path.join(manifests, "invalid", invalidName!.replace(/\.ecp\.json$/, ".expected.json")), "utf8"),
    ) as Array<{ code: string; path: string }>
    const result = await validateExecution(invalid, { capabilities: testCapabilities })
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
    const plugins = new FixturePluginAdapter(testPlugin, fixtureHandlers())
    const host = await createEnvironment()
      .use(bind(MemoryStorage.id, storage), StorageProvider)
      .use(bind(MemorySecrets.id, secrets), SecretsProvider)
      .use(bind(FixturePluginAdapter.id, plugins), PluginAdapter)
      .use(bind(QuickJsExpressionEngine.id, expression), ExpressionEngine)
      .start({ home: "/tmp/ecp" })

    for (const name of readdirSync(runsDir).filter((file) => file.endsWith(".ecp.json"))) {
      const execution = JSON.parse(readFileSync(path.join(runsDir, name), "utf8")) as ExecutionManifest
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
