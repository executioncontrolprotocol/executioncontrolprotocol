import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import type { CapabilityCall, CapabilityEntry, ConfigObject, ExecutionManifest, PluginManifest } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { resolveValue, runExecution, type StateStore } from "../src/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const runsDir = path.join(root, "fixtures/manifests/runs")
const manifest = JSON.parse(
  readFileSync(path.join(root, "fixtures/plugins/fixture-plugin/ecp.manifest.json"), "utf8"),
) as PluginManifest

const capabilities: CapabilityEntry[] = manifest.capabilities.map((capability) => ({
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
  timeoutMs: capability.timeoutMs,
}))

const engine = new QuickJsExpressionEngine()

beforeAll(async () => {
  await engine.start()
})

async function invoke(request: CapabilityCall, signal: AbortSignal, store: StateStore): Promise<unknown> {
  const input = (request.input ?? {}) as Record<string, unknown>
  if (request.capabilityId.endsWith(".echo")) {
    if (input.badOutput === true) return undefined
    if (input.scalar === true) return "plain"
    if (input.cycle === true) {
      const box: Record<string, unknown> = {}
      box.self = box
      return box
    }
    return { echo: input.value === undefined ? "hi" : input.value }
  }
  if (request.capabilityId.endsWith(".fail")) {
    throw Object.assign(new Error(String(input.message ?? "failed")), { code: input.code ?? "ECP_STEP_FAILED" })
  }
  if (request.capabilityId.endsWith(".delay")) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, Number(input.ms))
      signal.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
      })
    })
    return { waitedMs: input.ms }
  }
  if (request.capabilityId.endsWith(".stage")) {
    const handle = input.handle as { $state?: string }
    const target = { path: handle.$state ?? "history" }
    if (input.op === "set") store.set(target, input.value)
    else if (input.op === "merge") store.merge(target, { extra: input.value })
    else store.append(target, input.value)
    if (input.fail === true) throw Object.assign(new Error("stage failed"), { code: "ECP_STEP_FAILED" })
    return { ok: true }
  }
  if (request.capabilityId.endsWith(".bounded")) return { text: input.text }
  if (request.capabilityId.endsWith(".config-echo")) {
    return { echoed: request.config?.secret, keys: Object.keys(request.config ?? {}) }
  }
  throw new Error(`no handler for ${request.capabilityId}`)
}

describe("run fixtures", () => {
  it("matches status, result, step statuses and event order", async () => {
    for (const name of readdirSync(runsDir).filter((file) => file.endsWith(".ecp.json"))) {
      const execution = JSON.parse(readFileSync(path.join(runsDir, name), "utf8")) as ExecutionManifest
      const expected = JSON.parse(readFileSync(path.join(runsDir, name.replace(/\.ecp\.json$/, ".run.json")), "utf8")) as {
        input: Record<string, unknown>
        status: string
        result: Record<string, unknown>
        steps: Array<{ nodeId: string; status: string; round?: number }>
        events: string[]
      }
      const outcome = await runExecution(execution, expected.input, { capabilities, call: invoke, expression: engine })
      expect(outcome.status, name).toBe(expected.status)
      expect(outcome.result, name).toEqual(expected.result)
      expect(outcome.steps, name).toEqual(expected.steps)
      expect(outcome.events, name).toEqual(expected.events)
    }
  })

  it("redacts secrets, discards staged writes, times out, and conflicts on create", async () => {
    const secretConfig: ConfigObject = {
      schema: "@executioncontrolprotocol.config",
      version: "1.0",
      id: "test/default",
      plugin: "@executioncontrolprotocol/test",
      values: { secret: { $secret: "test.secret" } },
      objectVersion: 1,
      updatedAt: "2026-11-14T00:00:00.000Z",
    }
    const redacted = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "show",
            uses: "@executioncontrolprotocol/test.config-echo",
            config: "test/default",
            input: {},
            as: "shown",
          },
        ],
      },
      {},
      {
        capabilities,
        call: invoke,
        expression: engine,
        configs: [secretConfig],
        getSecret: async () => "super-secret",
      },
    )
    expect(JSON.stringify(redacted.result)).not.toContain("super-secret")
    expect(JSON.stringify(redacted.result)).toContain("[redacted]")

    const staged = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "stage",
            uses: "@executioncontrolprotocol/test.stage",
            input: { handle: { $state: "history" }, value: "note", fail: true },
            as: "staged",
          },
        ],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(staged.status).toBe("failed")
    expect(staged.result.history).toBeUndefined()

    const timed = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "slow", uses: "@executioncontrolprotocol/test.delay", input: { ms: 5000 }, as: "slow" }],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(timed.error?.code).toBe("ECP_STEP_TIMEOUT")

    const conflict = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          { id: "slot", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "slot", mode: "create" },
          { id: "again", uses: "@executioncontrolprotocol/test.echo", input: { value: "b" }, as: "slot", mode: "create" },
        ],
      },
      {},
      { capabilities, call: invoke, expression: engine, force: true },
    )
    expect(conflict.error?.code).toBe("ECP_COMMIT_CONFLICT")

    const resolved = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          { id: "seed", uses: "@executioncontrolprotocol/test.echo", input: { value: "hi" }, as: "seed" },
          { id: "use", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.seed.echo" } }, as: "use" },
          { id: "expr", uses: "@executioncontrolprotocol/test.echo", input: { value: { $expr: "(state) => state.seed.echo + '!'" } }, as: "expr" },
          { id: "opt", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.missing", optional: true, fallback: "fb" } }, as: "opt" },
          { id: "script", uses: "@executioncontrolprotocol/test.bounded", input: { text: { $script: { lang: "js", source: "1" } } }, as: "script" },
          { id: "stage", uses: "@executioncontrolprotocol/test.stage", input: { handle: { $state: "doc.history" }, value: "note" }, as: "staged" },
        ],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(resolved.status).toBe("completed")
    expect(resolved.result.use).toEqual({ echo: "hi" })
    expect(resolved.result.expr).toEqual({ echo: "hi!" })
    expect(resolved.result.opt).toEqual({ echo: "fb" })
    expect(resolved.result.script).toEqual({ text: "const params = {};\n1" })
    expect(resolved.result.doc).toEqual({ history: ["note"] })

    const missingSecret = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "show", uses: "@executioncontrolprotocol/test.config-echo", config: "test/default", input: {}, as: "shown" }],
      },
      {},
      { capabilities, call: invoke, expression: engine, configs: [secretConfig], getSecret: async () => undefined },
    )
    expect(missingSecret.error?.code).toBe("ECP_SECRET_MISSING")

    const badOutput = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "bad", uses: "@executioncontrolprotocol/test.echo", input: { badOutput: true }, as: "bad" }],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(badOutput.error?.code).toBe("ECP_OUTPUT_INVALID")
  })

  it("resolves refs, scripts, merge, append, returns, and env values", async () => {
    const state = { seed: { echo: "hi" }, items: ["a"] }
    await expect(resolveValue({ $ref: "state.seed.echo" }, state, engine)).resolves.toBe("hi")
    await expect(resolveValue({ $ref: "state.items.0" }, state, engine)).resolves.toBe("a")
    await expect(resolveValue([{ $ref: "state.missing", optional: true }], state, engine)).resolves.toEqual([null])
    await expect(resolveValue({ $ref: "state.nope" }, state, engine)).rejects.toMatchObject({ code: "ECP_REF_UNRESOLVED" })
    await expect(resolveValue({ $ref: "not-a-path" }, state, engine)).rejects.toMatchObject({ code: "ECP_REF_UNRESOLVED" })
    await expect(resolveValue({ $expr: "(state) => state.seed.echo" }, state, engine)).resolves.toBe("hi")
    await expect(resolveValue({ $state: "bucket" }, state, engine)).resolves.toEqual({ $state: "bucket" })
    await expect(resolveValue({ keep: 1, drop: { $ref: "state.missing", optional: true } }, state, engine)).resolves.toEqual({ keep: 1 })
    await expect(resolveValue({ $script: { lang: "js", source: "1", params: { n: { $ref: "state.seed.echo" } } } }, state, engine)).resolves.toContain('"n":"hi"')
    await expect(resolveValue({ $script: { lang: "js", path: "banner.js" } }, state, engine, async () => "1\n", "C:/tmp")).resolves.toContain("1")
    await expect(resolveValue({ $script: { lang: "js", path: "/tmp/banner.js" } }, state, engine, async () => { throw new Error("missing") })).rejects.toMatchObject({ code: "ECP_SCRIPT_INVALID" })
    await expect(resolveValue({ $script: { lang: "js", path: "banner.js" } }, state, engine)).rejects.toMatchObject({ code: "ECP_SCRIPT_INVALID" })
    await expect(resolveValue({ $script: { lang: "js" } }, state, engine)).rejects.toMatchObject({ code: "ECP_SCRIPT_INVALID" })
    await expect(resolveValue({ $script: { lang: "js", source: "function (" } }, state, engine)).rejects.toMatchObject({ code: "ECP_SCRIPT_INVALID" })

    const mixed = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { returns: { type: "object", properties: { list: { type: "object" } } } },
        steps: [
          { id: "a", uses: "@executioncontrolprotocol/test.echo", input: { value: { n: 1 } }, as: "bag", mode: "create" },
          { id: "b", uses: "@executioncontrolprotocol/test.echo", input: { value: { m: 2 } }, as: "bag", mode: "merge" },
          { id: "c", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "list", mode: "append" },
          { id: "d", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" }, as: "list", mode: "append" },
        ],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(mixed.result.bag).toBeUndefined()
    expect(mixed.result.list).toEqual([{ echo: "x" }, { echo: "y" }])

    const unknownConfig = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "show", uses: "@executioncontrolprotocol/test.echo", config: "missing/default", input: { value: "a" }, as: "out" }],
      },
      {},
      { capabilities, call: invoke, expression: engine, configs: [], getEnv: () => "from-env" },
    )
    expect(unknownConfig.error?.code).toBe("ECP_CONFIG_UNKNOWN")

    const shaped = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            type: "branch",
            id: "route",
            branches: [
              { expr: "(state) => true", steps: [{ id: "yes", uses: "@executioncontrolprotocol/test.echo", input: { value: "yes" }, as: "yes" }] },
              { steps: [{ id: "no", uses: "@executioncontrolprotocol/test.echo", input: { value: "no" }, as: "no" }] },
            ],
          },
          { type: "loop", id: "idle", expr: "(state) => false", maxRounds: 2, steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "z" }, as: "body" }] },
          { id: "note", uses: "@executioncontrolprotocol/test.echo", input: { value: "note" } },
          { id: "set", uses: "@executioncontrolprotocol/test.stage", input: { handle: { $state: "bag.item" }, op: "set", value: 1 } },
          { id: "merge", uses: "@executioncontrolprotocol/test.stage", input: { handle: { $state: "bag.item" }, op: "merge", value: 2 } },
          { id: "badmerge", uses: "@executioncontrolprotocol/test.echo", input: { scalar: true }, as: "bag", mode: "merge" },
        ],
      },
      {},
      {
        capabilities,
        call: invoke,
        expression: engine,
        maxConcurrency: 1,
        configs: [
          {
            schema: "@executioncontrolprotocol.config",
            version: "1.0",
            id: "test/default",
            plugin: "@executioncontrolprotocol/test",
            values: { name: { $env: "ECP_NAME" }, items: [{ $secret: "k" }] },
            objectVersion: 1,
            updatedAt: "2026-11-14T00:00:00.000Z",
          },
        ],
        getEnv: () => "from-env",
        getSecret: async () => "sek",
      },
    )
    expect(shaped.result.yes).toEqual({ echo: "yes" })
    expect(shaped.result.body).toBeUndefined()
    expect(shaped.error?.code).toBe("ECP_COMMIT_CONFLICT")

    const badGate = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "gate", uses: "@executioncontrolprotocol/test.echo", expr: "(state) => 1", input: { value: "a" }, as: "gate" }],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(badGate.error?.code).toBe("ECP_EXPR_RESULT_INVALID")

    const defaults = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          { type: "branch", id: "only", branches: [{ steps: [{ id: "yes", uses: "@executioncontrolprotocol/test.echo", input: { value: "yes" }, as: "yes" }] }] },
          { id: "cycle", uses: "@executioncontrolprotocol/test.echo", input: { cycle: true }, as: "cycle" },
        ],
      },
      {},
      { capabilities, call: invoke, expression: engine },
    )
    expect(defaults.result.yes).toEqual({ echo: "yes" })
    expect(defaults.error?.code).toBe("ECP_OUTPUT_INVALID")

    const fromEnv = await runExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [{ id: "show", uses: "@executioncontrolprotocol/test.config-echo", config: "test/default", input: {}, as: "shown" }],
      },
      {},
      {
        capabilities,
        call: invoke,
        expression: engine,
        configs: [
          {
            schema: "@executioncontrolprotocol.config",
            version: "1.0",
            id: "test/default",
            plugin: "@executioncontrolprotocol/test",
            values: { name: { $env: "ECP_NAME" } },
            objectVersion: 1,
            updatedAt: "2026-11-14T00:00:00.000Z",
          },
        ],
        getEnv: () => "from-env",
      },
    )
    expect(fromEnv.status).toBe("completed")
  })
})
