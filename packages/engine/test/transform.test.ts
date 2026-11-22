import { describe, expect, it } from "vitest"
import type { CapabilityEntry, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { EXECUTION_SCHEMA, EXECUTION_VERSION } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { HostSchemaSet, runExecution, validateExecution } from "../src/index.js"

const transformCapability: CapabilityEntry = {
  id: "@executioncontrolprotocol/core.transform",
  plugin: "@executioncontrolprotocol/core",
  package: "@executioncontrolprotocol/core",
  pluginVersion: "0.0.0",
  summary: "Transform",
  description: "",
  useCases: [],
  projections: [],
  contract: "step",
  code: "script",
}

const echoCapability: CapabilityEntry = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/test",
  pluginVersion: "0.0.0",
  summary: "echo",
  description: "",
  useCases: [],
  projections: [],
  accepts: { type: "object", properties: { value: {} } },
  returns: { type: "object", properties: { echo: {} } },
}

function transformManifest(overrides: Partial<ExecutionManifest["steps"][number]>): ExecutionManifest {
  return {
    schema: EXECUTION_SCHEMA,
    version: EXECUTION_VERSION,
    steps: [
      {
        id: "t",
        uses: transformCapability.id,
        accepts: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        returns: { type: "object", properties: { greeting: { type: "string" } }, required: ["greeting"] },
        script: { $script: { lang: "js", source: "return { greeting: 'hi ' + input.name }" } },
        input: { name: "Ada" },
        as: "out",
        ...overrides,
      },
    ],
  }
}

describe("transform validation", () => {
  it("accepts a valid transform step", async () => {
    const result = await validateExecution(transformManifest({}), { capabilities: [transformCapability] })
    expect(result.valid).toBe(true)
  })

  it("rejects accepts on a normal capability", async () => {
    const manifest = transformManifest({ uses: echoCapability.id, accepts: { type: "object" } })
    const result = await validateExecution(manifest, { capabilities: [echoCapability, transformCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path.includes("/accepts"))).toBe(
      true,
    )
  })

  it("rejects params on a transform script", async () => {
    const manifest = transformManifest({
      script: { $script: { lang: "js", source: "return {}", params: { x: 1 } } },
    })
    const result = await validateExecution(manifest, { capabilities: [transformCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID" && issue.path.includes("params"))).toBe(true)
  })

  it("rejects missing script on a script transform", async () => {
    const manifest = transformManifest({ script: undefined })
    const result = await validateExecution(manifest, { capabilities: [transformCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID" && issue.path.endsWith("/script"))).toBe(true)
  })

  it("rejects expression alongside script code", async () => {
    const manifest = transformManifest({ expression: "$.name" })
    const result = await validateExecution(manifest, { capabilities: [transformCapability] })
    expect(result.issues.some((issue) => issue.path.endsWith("/expression"))).toBe(true)
  })

  it("requires expression when capability code is expression", async () => {
    const expressionCapability: CapabilityEntry = { ...transformCapability, code: "expression" }
    const manifest = transformManifest({ script: undefined, expression: undefined })
    const result = await validateExecution(manifest, { capabilities: [expressionCapability] })
    expect(result.issues.some((issue) => issue.path.endsWith("/expression"))).toBe(true)
    const withScript = transformManifest({ script: { $script: { lang: "js", source: "return {}" } }, expression: "{}" })
    const bad = await validateExecution(withScript, { capabilities: [expressionCapability] })
    expect(bad.issues.some((issue) => issue.path.endsWith("/script"))).toBe(true)
  })

  it("rejects step accepts on echo", async () => {
    const manifest: ExecutionManifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      steps: [{ id: "e", uses: echoCapability.id, accepts: { type: "object" }, input: { value: 1 } }],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID")).toBe(true)
  })

  it("rejects non-js transform scripts", async () => {
    const manifest = transformManifest({
      script: { $script: { lang: "lua", source: "return {}" } },
    })
    const result = await validateExecution(manifest, { capabilities: [transformCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID")).toBe(true)
  })

  it("requires accepts and returns on step-contract capabilities", async () => {
    for (const manifest of [transformManifest({ accepts: undefined }), transformManifest({ returns: undefined })]) {
      const result = await validateExecution(manifest, { capabilities: [transformCapability] })
      expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID")).toBe(true)
    }
  })

  it("rejects script at the step level on echo", async () => {
    const manifest: ExecutionManifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      steps: [
        {
          id: "bad",
          uses: echoCapability.id,
          script: { $script: { lang: "js", source: "return {}" } },
          input: { value: 1 },
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.path.endsWith("/script"))).toBe(true)
  })

  it("reports bundled core as missing with a core-specific message", async () => {
    const manifest = transformManifest({})
    const result = await validateExecution(manifest, { capabilities: [] })
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ECP_PLUGINS_MISSING",
          message: expect.stringContaining("bundled with the host"),
        }),
      ]),
    )
  })
})

describe("transform execution", () => {
  const engine = new QuickJsExpressionEngine()

  it("passes expression to plugins.call when code is expression", async () => {
    const expressionCapability: CapabilityEntry = { ...transformCapability, code: "expression" }
    let seen: { expression?: string } | undefined
    const manifest = transformManifest({
      script: undefined,
      expression: "{ greeting: input.name }",
      accepts: { type: "object", properties: { name: { type: "string" } } },
      returns: { type: "object", properties: { greeting: { type: "string" } } },
    })
    await runExecution(manifest, {}, {
      capabilities: [expressionCapability],
      expression: engine,
      call: async (request) => {
        seen = request.context as { expression?: string }
        return { greeting: `hi ${(request.input as { name: string }).name}` }
      },
    })
    expect(seen?.expression).toBe("{ greeting: input.name }")
  })

  it("runs a transform and returns the declared object", async () => {
    await engine.start()
    const schemas = await HostSchemaSet.create([transformCapability])
    const outcome = await runExecution(transformManifest({}), {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => {
        throw new Error("plugins.call must not run for script transforms")
      },
      schemas,
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual({ greeting: "hi Ada" })
  })

  it("fails when the result does not match returns", async () => {
    const manifest = transformManifest({
      returns: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] },
    })
    const schemas = await HostSchemaSet.create([transformCapability])
    const outcome = await runExecution(manifest, {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => ({}),
      schemas,
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_OUTPUT_INVALID")
  })

  it("fails when the script throws", async () => {
    const manifest = transformManifest({
      script: { $script: { lang: "js", source: "throw new Error('boom')" } },
    })
    const outcome = await runExecution(manifest, {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => ({}),
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_SCRIPT_FAILED")
    expect(outcome.error?.message).toContain("boom")
  })

  it("allows any JSON object when returns is {}", async () => {
    const manifest = transformManifest({
      returns: {},
      script: { $script: { lang: "js", source: "return { ok: true, extra: 1 }" } },
    })
    const outcome = await runExecution(manifest, {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => ({}),
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual({ ok: true, extra: 1 })
  })

  it("fails when the script returns undefined", async () => {
    const manifest = transformManifest({
      script: { $script: { lang: "js", source: "return undefined" } },
    })
    const outcome = await runExecution(manifest, {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => ({}),
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_OUTPUT_INVALID")
  })

  it("rejects inline $expr in step input", async () => {
    const manifest: ExecutionManifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      steps: [
        {
          id: "bad",
          uses: echoCapability.id,
          input: { value: { $expr: "(state) => 1" } },
          as: "bad",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.code === "ECP_EXPR_INVALID")).toBe(true)
    expect(result.issues.some((issue) => issue.suggestions?.includes("Use a transform step. Data edges are $ref only."))).toBe(
      true,
    )
  })

  it("reports an inline $expr once, without a type mismatch on the marker", async () => {
    const typed: CapabilityEntry = {
      ...echoCapability,
      accepts: { type: "object", properties: { value: { type: "string" } } },
    }
    const manifest: ExecutionManifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      steps: [{ id: "bad", uses: typed.id, input: { value: { $expr: "(state) => 'x'" } }, as: "bad" }],
    }
    const result = await validateExecution(manifest, {
      capabilities: [typed],
      schemas: await HostSchemaSet.create([typed]),
    })
    expect(result.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ["ECP_EXPR_INVALID", "/steps/0/input/value/$expr"],
    ])
  })

  it("rejects $expr nested under $script.params", async () => {
    const manifest: ExecutionManifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      steps: [
        {
          id: "uxp",
          uses: echoCapability.id,
          input: {
            value: {
              $script: {
                lang: "js",
                source: "1",
                params: { n: { $expr: "(state) => 1" } },
              },
            },
          },
          as: "uxp",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes("/$expr") && issue.code === "ECP_EXPR_INVALID")).toBe(true)
  })

  it("records the script source on the step", async () => {
    const source = "return { greeting: 'stored' }"
    const manifest = transformManifest({
      script: { $script: { lang: "js", source } },
      input: {},
    })
    const records: Array<{ script?: string }> = []
    await runExecution(manifest, {}, {
      capabilities: [transformCapability],
      expression: engine,
      call: async () => ({}),
      store: {
        writeStep: async (_runId, record) => {
          records.push(record as { script?: string })
        },
        writeState: async () => {},
        appendEvent: async () => {},
      },
    })
    expect(records[0]?.script).toBe(source)
  })
})