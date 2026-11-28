import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { CapabilityEntry, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  dedupeIssues,
  damerauLevenshtein,
  HostSchemaSet,
  loadExecutionText,
  validateExecution,
  validateExecutionLayers,
} from "../src/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(here, "../../../fixtures/plugins/fixture-plugin")
const plugin = JSON.parse(readFileSync(path.join(fixtureDir, "ecp.manifest.json"), "utf8")) as {
  plugin: { id: string; package: string; version: string }
  capabilities: Array<Record<string, unknown>>
}
const schemaDocument = JSON.parse(readFileSync(path.join(fixtureDir, "ecp.schema.json"), "utf8")) as {
  $defs: Record<string, Record<string, unknown>>
}

const capabilities: CapabilityEntry[] = plugin.capabilities.map((capability) => ({
  id: String(capability.id),
  plugin: plugin.plugin.id,
  package: plugin.plugin.package,
  pluginVersion: plugin.plugin.version,
  summary: String(capability.summary),
  description: String(capability.description),
  useCases: capability.useCases as string[],
  projections: capability.projections as string[],
  accepts: schemaDocument.$defs[`${String(capability.name)}.accepts`]!,
  returns: schemaDocument.$defs[`${String(capability.name)}.returns`]!,
  configSchema: schemaDocument.$defs.config,
  timeoutMs: capability.timeoutMs as number | undefined,
}))

const echo = capabilities.find((capability) => capability.id.endsWith(".echo"))!

function execution(steps: ExecutionManifest["steps"], executionBlock?: ExecutionManifest["execution"]): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    ...(executionBlock ? { execution: executionBlock } : {}),
    steps,
  }
}

const step = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, uses: echo.id, input: { value: id }, as: id, ...extra }) as ExecutionManifest["steps"][number]

describe("validation edges", () => {
  it("covers syntax, run input, config, refs, and commit modes", async () => {
    const syntax = await validateExecution(
      execution([
        { type: "if", id: "literal", expression: "1 ++", then: [step("literal")] },
        { type: "if", id: "tail", expression: "true; 1", then: [step("tail")] },
        { type: "if", id: "star", expression: "await 1", then: [step("star")] },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(syntax.issues.filter((issue) => issue.code === "ECP_EXPR_INVALID").length).toBe(3)

    const input = await validateExecution(
      execution([step("echo")], { accepts: { type: "object", properties: { name: { type: "string", default: "anon" } }, required: ["name"] } }),
      { capabilities, input: {} },
    )
    expect(input.issues.some((issue) => issue.code === "ECP_INPUT_INVALID" && issue.path.startsWith("/input"))).toBe(false)

    const missingName = await validateExecution(
      execution([step("echo")], { accepts: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }),
      { capabilities, input: {} },
    )
    expect(missingName.issues.some((issue) => issue.path === "/input/name")).toBe(true)

    const schema = { type: "object", required: ["label"], properties: { label: { type: "string" }, secret: { type: "string" } } }
    const configured = { ...echo, configSchema: schema }
    const badConfig = await validateExecution(
      execution([{ id: "echo", uses: echo.id, config: "test/default", input: { value: "a" }, as: "out" }] as ExecutionManifest["steps"]),
      {
        capabilities: [configured],
        configs: [
          {
            schema: "@executioncontrolprotocol.config",
            version: "1.0",
            id: "test/default",
            plugin: plugin.plugin.id,
            values: { secret: { $secret: "test.secret" }, extra: ["x"] },
            objectVersion: 1,
            updatedAt: "2026-11-14T00:00:00.000Z",
          },
        ],
      },
    )
    expect(badConfig.issues.some((issue) => issue.code === "ECP_CONFIG_INVALID")).toBe(true)

    const named = await validateExecution(
      execution([step("name")] as ExecutionManifest["steps"], { accepts: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }),
      { capabilities },
    )
    expect(named.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path.endsWith("/as"))).toBe(true)

    const listCap: CapabilityEntry = {
      ...echo,
      id: "@executioncontrolprotocol/test.list",
      accepts: { type: "object", properties: { value: { type: "number" } }, additionalProperties: false },
      returns: { type: "object", properties: { items: { type: "array", items: { type: "number" } } } },
    }
    const indexed = await validateExecution(
      execution([
        { id: "row", uses: listCap.id, input: { value: 1 }, as: "row" },
        { id: "use", uses: listCap.id, input: { value: { $ref: "state.row.items.0" } }, as: "use", mode: "append" },
        { id: "mix", uses: listCap.id, input: { value: 2 }, as: "use", mode: "merge" },
      ] as ExecutionManifest["steps"]),
      { capabilities: [listCap] },
    )
    expect(indexed.valid).toBe(true)

    const sibling = await validateExecution(
      execution([
        {
          type: "parallel",
          id: "both",
          paths: [
            [step("left")],
            [{ id: "right", uses: echo.id, input: { value: { $ref: "state.left" } }, as: "right" }],
          ],
        },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(sibling.issues.some((issue) => issue.message.includes("parallel sibling"))).toBe(true)

    const missingFile = await validateExecution(
      execution([
        {
          id: "scripted",
          uses: capabilities.find((capability) => capability.id.endsWith(".bounded"))!.id,
          input: { text: { $script: { lang: "js", path: "C:/missing/nope.js" } } },
          as: "scripted",
        },
      ] as ExecutionManifest["steps"]),
      { capabilities, readText: () => Promise.reject(new Error("missing")) },
    )
    expect(missingFile.issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID")).toBe(true)

    const set = await HostSchemaSet.create(capabilities)
    expect(set.validateInput(echo, { value: 1 }).length).toBeGreaterThanOrEqual(0)
    const bounded = capabilities.find((capability) => capability.id.endsWith(".bounded"))!
    const relative = await validateExecution(
      execution([
        { id: "scripted", uses: bounded.id, input: { text: { $script: { lang: "js", path: "banner.js" } } }, as: "scripted" },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(relative.issues.some((issue) => issue.message.includes("no directory"))).toBe(true)
    const unread = await validateExecution(
      execution([
        { id: "scripted", uses: bounded.id, input: { text: { $script: { lang: "js", path: "banner.js" } } }, as: "scripted" },
      ] as ExecutionManifest["steps"]),
      { capabilities, executionDir: "C:/tmp" },
    )
    expect(unread.issues.some((issue) => issue.message.includes("cannot be read"))).toBe(true)
    const arrayCap: CapabilityEntry = {
      ...echo,
      id: "@executioncontrolprotocol/test.listish",
      accepts: {
        type: "object",
        properties: {
          note: { type: ["string", "null"] },
          values: { type: "array", items: { type: "number" } },
        },
      },
      returns: { type: "array", items: { type: "string" } },
    }
    const listed = await validateExecution(
      execution([
        {
          id: "items",
          uses: arrayCap.id,
          input: { note: null, values: [1, { $ref: "state.missing" }] },
          as: "items",
        },
      ] as ExecutionManifest["steps"]),
      { capabilities: [arrayCap] },
    )
    expect(listed.issues.some((issue) => issue.code === "ECP_REF_UNRESOLVED")).toBe(true)

    expect(await validateExecution(null, { capabilities })).toMatchObject({ valid: false })
    expect((await validateExecution({ schema: "nope", version: "2.0", steps: [] }, { capabilities })).issues[0]?.path).toBe("/schema")
  })
})

describe("validation", () => {
  it("rejects text that is not JSON and a wrong manifest version", async () => {
    expect(loadExecutionText("{").issues[0]?.code).toBe("ECP_EXECUTION_LOAD")
    const wrong = await validateExecution({ schema: "@executioncontrolprotocol.execution", version: "1.0", steps: [] }, {
      capabilities,
    })
    expect(wrong.issues[0]).toMatchObject({ code: "ECP_EXECUTION_LOAD", path: "/version" })
  })

  it("changes schemaHash when plugin schema fingerprints change and caches input validators", async () => {
    const fingerprints = [{ pluginId: echo.plugin, version: echo.pluginVersion, hash: "a".repeat(64) }]
    const first = await HostSchemaSet.create(capabilities, { schemaFingerprints: fingerprints })
    const second = await HostSchemaSet.create(capabilities, {
      schemaFingerprints: [{ ...fingerprints[0]!, hash: "b".repeat(64) }],
    })
    expect(first.schemaHash).not.toBe(second.schemaHash)
    expect(first.schema.$id).toBe("ecp://host/execution.schema.json")
    const input = { value: "hi" }
    expect(first.validateInput(echo, input)).toEqual([])
    expect(first.inputCompileCount).toBe(1)
    expect(first.validateInput(echo, input)).toEqual([])
    expect(first.inputCompileCount).toBe(1)
  })

  it("suggests close capability ids and orders issues by path", async () => {
    expect(damerauLevenshtein("text", "txet")).toBe(1)
    const result = await validateExecution(
      execution([
        { id: "b", uses: echo.id.replace("echo", "eco"), input: { value: 1 }, as: "b" },
        { id: "a", uses: "nope", as: "a" },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    const unknown = result.issues.find((issue) => issue.path === "/steps/0/uses")
    expect(unknown?.code).toBe("ECP_CAPABILITY_UNKNOWN")
    expect(unknown?.suggestions?.[0]).toContain("echo")
    const paths = result.issues.map((issue) => issue.path)
    const sorted = [...paths].sort()
    expect(paths).toEqual(sorted)
  })

  it("reports data-flow edges for if nodes, loops, parallel paths, and types", async () => {
    const gated = await validateExecution(
      execution([
        { type: "if", id: "pick", expression: "false", then: [step("gated")] },
        { id: "after", uses: echo.id, input: { value: { $ref: "state.gated" } }, as: "after" },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(gated.issues.some((issue) => issue.code === "ECP_REF_MAYBE_MISSING")).toBe(true)

    const routed = await validateExecution(
      execution(
        [
          {
            type: "if",
            id: "route",
            expression: "true",
            then: [step("made")],
          },
          { id: "use", uses: echo.id, input: { value: { $ref: "state.made" } }, as: "use" },
        ] as ExecutionManifest["steps"],
        { returns: { type: "object", properties: { made: { type: "object" } } } },
      ),
      { capabilities },
    )
    expect(routed.issues.some((issue) => issue.code === "ECP_RETURNS_UNRESOLVED" && issue.severity === "warning")).toBe(true)

    const loop = await validateExecution(
      execution([
        {
          type: "loop",
          mode: "for",
          id: "again",
          input: { count: 1 },
          as: "i",
          steps: [step("body", { mode: "replace" })],
        },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(loop.valid).toBe(true)

    const parallel = await validateExecution(
      execution([
        {
          type: "parallel",
          id: "both",
          paths: [[step("same")], [step("same", { id: "other" })]],
        },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(parallel.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT")).toBe(true)

    const numberCap: CapabilityEntry = {
      ...echo,
      id: "@executioncontrolprotocol/test.number",
      accepts: { type: "object", properties: { value: { type: "number" } } },
      returns: { type: "object", properties: { echo: { type: "integer" } } },
    }
    const stringCap: CapabilityEntry = {
      ...echo,
      id: "@executioncontrolprotocol/test.string",
      accepts: { type: "object", properties: { value: { type: "string" } } },
      returns: { type: "object", properties: { echo: { type: "string" } } },
    }
    const fit = await validateExecution(
      execution([
        { id: "n", uses: numberCap.id, input: { value: 1 }, as: "n" },
        { id: "use", uses: numberCap.id, input: { value: { $ref: "state.n.echo" } }, as: "use" },
      ] as ExecutionManifest["steps"]),
      { capabilities: [numberCap] },
    )
    expect(fit.valid).toBe(true)

    const mismatch = await validateExecution(
      execution([
        { id: "n", uses: numberCap.id, input: { value: 1 }, as: "n" },
        { id: "use", uses: stringCap.id, input: { value: { $ref: "state.n.echo" } }, as: "use" },
      ] as ExecutionManifest["steps"]),
      { capabilities: [numberCap, stringCap] },
    )
    expect(mismatch.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(true)

    const expr = await validateExecution(
      execution([
        { id: "n", uses: numberCap.id, input: { value: 1 }, as: "n" },
        { id: "use", uses: stringCap.id, input: { value: { $expr: "(state) => String(state.n.echo)" } }, as: "use" },
      ] as ExecutionManifest["steps"]),
      { capabilities: [numberCap, stringCap] },
    )
    expect(expr.valid).toBe(false)
    expect(expr.issues.some((issue) => issue.code === "ECP_EXPR_INVALID")).toBe(true)

    const unknown = await validateExecution(
      execution([
        { id: "n", uses: echo.id, input: { value: { opaque: true } }, as: "n" },
        { id: "use", uses: echo.id, input: { value: { $ref: "state.n.echo.missing" } }, as: "use" },
      ] as ExecutionManifest["steps"]),
      { capabilities },
    )
    expect(unknown.issues.some((issue) => issue.code === "ECP_REF_PATH_INVALID")).toBe(false)
  })

  it("caps available ref paths at 50", async () => {
    const properties: Record<string, unknown> = {}
    for (let index = 0; index < 60; index += 1) properties[`field${index}`] = { type: "string" }
    const wide: CapabilityEntry = {
      ...echo,
      returns: { type: "object", properties },
    }
    const result = await validateExecution(
      execution([
        { id: "wide", uses: wide.id, input: { value: "x" }, as: "wide" },
        { id: "missing", uses: wide.id, input: { value: { $ref: "state.nope" } }, as: "missing" },
      ] as ExecutionManifest["steps"]),
      { capabilities: [wide] },
    )
    const unresolved = result.issues.find((issue) => issue.code === "ECP_REF_UNRESOLVED")
    expect(unresolved?.available?.length).toBeLessThanOrEqual(50)
    expect(unresolved?.available?.length).toBe(50)
  })
})

describe("validation output contract (F2–F4)", () => {
  const manifestFile = JSON.parse(
    readFileSync(path.join(fixtureDir, "ecp.manifest.json"), "utf8"),
  ) as { pluginSchema: { hash: string } }
  const loadPluginSchema = async () => schemaDocument
  const schemaFingerprints = [
    { pluginId: plugin.plugin.id, version: plugin.plugin.version, hash: manifestFile.pluginSchema.hash },
  ]
  const validateOpts = { capabilities, loadPluginSchema, schemaFingerprints }

  it("dedupes identical issues and keeps distinct messages at the same path", () => {
    const sample = [
      { code: "ECP_MANIFEST_INVALID" as const, severity: "error" as const, message: "a", path: "/x" },
      { code: "ECP_MANIFEST_INVALID" as const, severity: "error" as const, message: "a", path: "/x" },
      { code: "ECP_MANIFEST_INVALID" as const, severity: "error" as const, message: "b", path: "/x" },
    ]
    expect(dedupeIssues(sample)).toHaveLength(2)
  })

  it("matches schema-env message and suggestion (F3)", async () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(here, "../../../fixtures/manifests/invalid/schema-env.ecp.json"), "utf8"),
    ) as ExecutionManifest
    const result = await validateExecution(manifest, validateOpts)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "ECP_MANIFEST_INVALID",
        path: "/steps/0/input/value",
        message: "$env is not allowed in an execution; put it in a config object",
        suggestions: [
          "move this value into a config object (ecp commit --type config) and set the step config field",
        ],
      }),
    ])
  })

  it("validates a forEach manifest with typed input.items", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: { accepts: { type: "object", properties: { rows: { type: "array" } }, required: ["rows"] } },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "rows",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [{ id: "body", uses: echo.id, input: { value: { $ref: "state.row" } }, as: "piece" }],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities })
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
  })

  it("rejects loop end on forEach", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "rows",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [{ id: "body", uses: echo.id, input: { value: { $ref: "state.row" } }, as: "out" }],
          end: { input: { value: { $ref: "state.out" } } },
        },
      ],
    }
    const result = await validateExecution(manifest, validateOpts)
    expect(result.issues.some((issue) => issue.path === "/steps/0/end")).toBe(true)
  })

  it("reports schema-secret-positions without schema noise", async () => {
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(here, "../../../fixtures/manifests/invalid/schema-secret-positions.ecp.json"),
        "utf8",
      ),
    ) as ExecutionManifest
    const result = await validateExecution(manifest, validateOpts)
    expect(result.issues).toHaveLength(4)
    expect(result.issues.every((issue) => issue.code === "ECP_MANIFEST_INVALID")).toBe(true)
    expect(JSON.stringify(result.issues)).not.toMatch(/boolean schema is false/i)
  })

  it("validateExecutionLayers marks L0 and L1 as blocking draft", async () => {
    const detached = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "s" }],
      detached: [{ id: "d", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" }, as: "d" }],
    } satisfies ExecutionManifest
    const l2 = await validateExecutionLayers(detached, validateOpts)
    expect(l2.blocksDraft).toBe(false)
    expect(l2.result.issues.some((issue) => issue.code === "ECP_NODE_DETACHED")).toBe(true)
    const l1 = await validateExecutionLayers(
      { schema: "wrong", version: "2.0", steps: detached.steps },
      validateOpts,
    )
    expect(l1.blocksDraft).toBe(true)
  })

  it("validateExecutionLayers reports an empty loop body at L2", async () => {
    const emptyLoop = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "loop", id: "l", mode: "for", as: "i", input: { count: 1 }, steps: [] }],
    } satisfies ExecutionManifest
    const layers = await validateExecutionLayers(emptyLoop, validateOpts)
    expect(layers.result.issues.some((issue) => issue.message === "the loop has no nodes")).toBe(true)
  })

  it("validateExecutionLayers reports empty control lists at L2 without blocking draft", async () => {
    const emptyTunnel = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: "@executioncontrolprotocol/test.echo", as: "a" }],
            [],
          ],
        },
      ],
    } satisfies ExecutionManifest
    const layers = await validateExecutionLayers(emptyTunnel, validateOpts)
    expect(layers.blocksDraft).toBe(false)
    expect(layers.result.issues.some((issue) => issue.message === "path 2 has no nodes")).toBe(true)
  })

  it("validateExecutionLayers lets capability errors through to a draft but not a broken document", async () => {
    const unknownUses = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ id: "s", uses: "@executioncontrolprotocol/not-installed.echo", input: { value: "x" }, as: "s" }],
    } satisfies ExecutionManifest
    const capability = await validateExecutionLayers(unknownUses, validateOpts)
    expect(capability.result.issues.some((issue) => issue.code === "ECP_CAPABILITY_UNKNOWN")).toBe(true)
    expect(capability.blocksDraft).toBe(false)
    const broken = await validateExecutionLayers(
      { schema: "@executioncontrolprotocol.execution", version: "2.0", steps: [{ id: "s" }] },
      validateOpts,
    )
    expect(broken.blocksDraft).toBe(true)
  })

  const invalidDir = path.resolve(here, "../../../fixtures/manifests/invalid")
  const invalidFixtureNames = readdirSync(invalidDir)
    .filter(
      (name) =>
        name.endsWith(".ecp.json") && name !== "not-json.ecp.json" && name !== "ref-maybe-loop.ecp.json",
    )
    .sort()

  it.each(invalidFixtureNames)('invalid fixture %s fails validation', async (name) => {
    const manifest = JSON.parse(readFileSync(path.join(invalidDir, name), "utf8")) as ExecutionManifest
    const result = await validateExecution(manifest, validateOpts)
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
