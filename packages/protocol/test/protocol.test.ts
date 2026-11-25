import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Ajv from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { describe, expect, it } from "vitest"
import {
  ERROR_CATALOGUE,
  EXECUTION_SCHEMA,
  EXECUTION_VERSION,
  MAX_LOOP_CONCURRENCY,
  MAX_LOOP_ITEMS,
  PLUGIN_MANIFEST_VERSION,
  PROTOCOL_VERSION,
  catalogueEntry,
  firstPartyInstallCommand,
  FIRST_PARTY_PLUGINS,
  firstPartyPlugin,
  isEcpErrorCode,
  pluginIdFromCapability,
  type ExecutionManifest,
} from "../src/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const schemaDir = path.resolve(here, "../schemas")
const repoRoot = path.resolve(here, "../../..")
const fixtureRoot = path.join(repoRoot, "fixtures")

const SCHEMA_FILES = [
  "execution.base.schema.json",
  "config.schema.json",
  "run.schema.json",
  "step-record.schema.json",
  "run-event.schema.json",
  "plugin-manifest.schema.json",
  "plugin-schema.schema.json",
  "host.schema.json",
  "retrieve.input.schema.json",
  "execute.input.schema.json",
  "commit.input.schema.json",
  "validation-result.schema.json",
  "envelope.schema.json",
] as const

function ajv(): Ajv {
  const instance = new Ajv({ allErrors: true, strict: false })
  addFormats(instance)
  return instance
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown
}

function errorPaths(validate: { errors?: Array<{ instancePath?: string; params?: Record<string, unknown> }> | null }): string[] {
  const paths: string[] = []
  for (const error of validate.errors ?? []) {
    const instancePath = error.instancePath ?? ""
    const missing = error.params?.missingProperty ?? error.params?.additionalProperty
    const pointer = missing === undefined ? instancePath : `${instancePath}/${String(missing)}`
    paths.push(pointer.length === 0 ? "/" : pointer)
  }
  return paths
}

describe("error catalogue", () => {
  it("returns the entry for every code", () => {
    for (const code of Object.keys(ERROR_CATALOGUE)) {
      expect(isEcpErrorCode(code)).toBe(true)
      expect(catalogueEntry(code as keyof typeof ERROR_CATALOGUE).exitCode).toBeGreaterThanOrEqual(0)
    }
  })

  it("rejects an unknown code", () => {
    expect(isEcpErrorCode("ECP_NOT_A_CODE")).toBe(false)
  })

  it("exports loop runtime caps", () => {
    expect(MAX_LOOP_CONCURRENCY).toBe(32)
    expect(MAX_LOOP_ITEMS).toBe(10000)
  })

  it("catalogues ECP_NODE_DETACHED as validation", () => {
    expect(catalogueEntry("ECP_NODE_DETACHED")).toEqual({
      httpStatus: 422,
      exitCode: 2,
      kind: "validation",
    })
  })

  it("catalogues ECP_LIMIT_EXCEEDED as a runtime failure", () => {
    expect(catalogueEntry("ECP_LIMIT_EXCEEDED")).toEqual({
      httpStatus: null,
      exitCode: 1,
      kind: "runtime",
    })
  })

  it("maps first-party plugins and ignores unknown ids", () => {
    expect(pluginIdFromCapability("@executioncontrolprotocol/test.echo")).toBe("@executioncontrolprotocol/test")
    expect(pluginIdFromCapability("echo")).toBeUndefined()
    expect(pluginIdFromCapability("@executioncontrolprotocol/test")).toBeUndefined()
    expect(pluginIdFromCapability("@scope.echo")).toBeUndefined()
    expect(firstPartyPlugin("@executioncontrolprotocol/anthropic")?.short).toBe("anthropic")
    expect(firstPartyPlugin("@other/plugin")).toBeUndefined()
    expect(firstPartyInstallCommand("@executioncontrolprotocol/test")).toBe("ecp plugins install test")
    expect(firstPartyInstallCommand("@executioncontrolprotocol/jsonata")).toBe("ecp plugins install jsonata")
    expect(firstPartyInstallCommand("@executioncontrolprotocol/core")).toBeUndefined()
    expect(firstPartyPlugin("@executioncontrolprotocol/core")?.bundled).toBe(true)
    expect(firstPartyInstallCommand("@other/plugin")).toBeUndefined()
  })

  it("gives every first-party plugin one name: package name equals plugin id", () => {
    for (const [id, entry] of Object.entries(FIRST_PARTY_PLUGINS)) {
      expect(entry.packageName).toBe(id)
      expect(id).toBe(`@executioncontrolprotocol/${entry.short}`)
    }
    const pluginsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../plugins")
    for (const dir of readdirSync(pluginsDir)) {
      const manifest = JSON.parse(readFileSync(path.join(pluginsDir, dir, "ecp.manifest.json"), "utf8")) as {
        plugin: { id: string; package: string }
      }
      const pkg = JSON.parse(readFileSync(path.join(pluginsDir, dir, "package.json"), "utf8")) as { name: string }
      expect([manifest.plugin.id, manifest.plugin.package]).toEqual([pkg.name, pkg.name])
    }
  })
})

describe("JSON Schemas", () => {
  it("stamps plugin-manifest version 2.0", () => {
    expect(PLUGIN_MANIFEST_VERSION).toBe("2.0")
  })

  it("compiles every schema under Ajv 2020", () => {
    const compiler = ajv()
    for (const name of SCHEMA_FILES) {
      const schema = readJson(path.join(schemaDir, name))
      expect(() => compiler.compile(schema as object), name).not.toThrow()
    }
  })

  it("accepts a sample object that matches the TypeScript manifest type", () => {
    const manifest = {
      schema: EXECUTION_SCHEMA,
      version: EXECUTION_VERSION,
      execution: {
        id: "sample",
        accepts: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      },
      steps: [
        {
          id: "echo",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: "state.value" } },
          as: "echo",
          mode: "replace",
        },
      ],
    } satisfies ExecutionManifest
    const compiler = ajv()
    const validate = compiler.compile(readJson(path.join(schemaDir, "execution.base.schema.json")) as object)
    expect(validate(manifest)).toBe(true)
  })

  it("rejects run records with host.pid 0 or missing mode", () => {
    const base = {
      schema: "@executioncontrolprotocol.run",
      version: "1.0",
      id: "run-20261114T000000Z-abcdef",
      execution: { path: null, manifestHash: "abc" },
      status: "completed",
      input: {},
      result: {},
      error: null,
      startedAt: "2026-11-14T00:00:00.000Z",
      plugins: {},
      warnings: [],
      publishes: [],
    }
    const validate = ajv().compile(readJson(path.join(schemaDir, "run.schema.json")) as object)
    expect(validate({ ...base, host: { version: PROTOCOL_VERSION, pid: 0, mode: "in-process" } })).toBe(false)
    expect(validate({ ...base, host: { version: PROTOCOL_VERSION, pid: 1 } })).toBe(false)
    expect(validate({ ...base, host: { version: PROTOCOL_VERSION, pid: 1, mode: "server" } })).toBe(true)
  })

  it("accepts sample objects for the other document schemas", () => {
    const samples: Record<string, unknown> = {
      "config.schema.json": {
        schema: "@executioncontrolprotocol.config",
        version: "1.0",
        id: "test/default",
        plugin: "@executioncontrolprotocol/test",
        values: { secret: { $secret: "test.secret" } },
        objectVersion: 1,
        updatedAt: "2026-11-14T00:00:00.000Z",
      },
      "run.schema.json": {
        schema: "@executioncontrolprotocol.run",
        version: "1.0",
        id: "run-20261114T000000Z-abcdef",
        execution: { path: null, manifestHash: "abc" },
        status: "completed",
        input: {},
        result: {},
        error: null,
        startedAt: "2026-11-14T00:00:00.000Z",
        plugins: {},
        host: { version: PROTOCOL_VERSION, pid: 1, mode: "in-process" },
        warnings: [],
        publishes: [],
      },
      "step-record.schema.json": {
        nodeId: "echo",
        round: null,
        capabilityId: "@executioncontrolprotocol/test.echo",
        status: "completed",
        input: { value: "hi" },
        output: { echo: "hi" },
        error: null,
        startedAt: "2026-11-14T00:00:00.000Z",
      },
      "run-event.schema.json": { seq: 1, at: "2026-11-14T00:00:00.000Z", type: "run.start", data: {} },
      "host.schema.json": {
        schema: "@executioncontrolprotocol.host",
        version: "1.0",
        supervisorPid: 1,
        hostPid: 2,
        port: 51234,
        controlPort: 51235,
        token: "a".repeat(43),
        hostVersion: PROTOCOL_VERSION,
        startedAt: "2026-11-14T00:00:00.000Z",
        home: "/tmp/ecp",
      },
      "retrieve.input.schema.json": { type: "capability", query: "echo" },
      "execute.input.schema.json": { execution: { path: "/tmp/echo.ecp.json" }, mode: "validate" },
      "commit.input.schema.json": { type: "execution", action: "create", object: {} },
      "validation-result.schema.json": {
        valid: true,
        issues: [],
        manifestHash: "abc",
        schemaHash: "def",
      },
      "envelope.schema.json": { ok: false, error: { code: "ECP_NOT_FOUND", message: "Missing." } },
      "plugin-manifest.schema.json": {
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/test",
          package: "@executioncontrolprotocol/test",
          version: "1.0.0",
          summary: "Test.",
          description: "Test plugin.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: {
          path: "./ecp.schema.json",
          hash: "a".repeat(64),
        },
        capabilities: [
          {
            id: "@executioncontrolprotocol/test.echo",
            name: "echo",
            summary: "Echo.",
            description: "Echoes.",
            useCases: ["Echo"],
            projections: ["Take echo"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      },
      "plugin-schema.schema.json": {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "ecp://plugins/@executioncontrolprotocol/test/1.0.0/schema.json",
        $defs: {
          "echo.accepts": { type: "object" },
          "echo.returns": { type: "object" },
        },
      },
    }
    const compiler = ajv()
    for (const [name, sample] of Object.entries(samples)) {
      const validate = compiler.compile(readJson(path.join(schemaDir, name)) as object)
      expect(validate(sample), name).toBe(true)
    }
  })
})

describe("path draft operation input schemas", () => {
  it("allows path, draft, scripts, and string ifVersion on commit", () => {
    const commitValidate = ajv().compile(readJson(path.join(schemaDir, "commit.input.schema.json")) as object)
    expect(
      commitValidate({
        type: "execution",
        action: "update",
        path: "/tmp/flow.ecp.json",
        ifVersion: "abc123",
        draft: true,
        object: {},
        scripts: { "a.js": "x" },
      }),
    ).toBe(true)
    expect(commitValidate({ type: "execution", action: "create", path: "/tmp/x.ecp.json", object: {} })).toBe(false)
  })

  it("allows path, filter.dir, and include scripts on retrieve", () => {
    const retrieveValidate = ajv().compile(readJson(path.join(schemaDir, "retrieve.input.schema.json")) as object)
    expect(
      retrieveValidate({ type: "execution", path: "/tmp/x.ecp.json", include: ["scripts"] }),
    ).toBe(true)
    expect(retrieveValidate({ type: "execution", filter: { dir: "/tmp" } })).toBe(true)
    expect(retrieveValidate({ type: "config", scripts: true, include: ["scripts"] } as never)).toBe(false)
  })
})

/** Fixtures excluded from bulk schema acceptance (tracked separately if any). */
describe("loop node schema", () => {
  const validate = ajv().compile(readJson(path.join(schemaDir, "execution.base.schema.json")) as object)
  const base = { schema: EXECUTION_SCHEMA, version: EXECUTION_VERSION }

  it("accepts while loop with end.repeat and maxRounds", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "loop",
            id: "L",
            maxRounds: 3,
            steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
            end: { input: { repeat: true } },
          },
        ],
      }),
    ).toBe(true)
  })

  it("accepts forEach loop with input.items, end.value, and mode fields", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "loop",
            mode: "forEach",
            id: "items",
            input: { items: { $ref: "state.rows" } },
            as: "row",
            into: "results",
            concurrency: 2,
            steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
            end: { input: { value: { $ref: "state.out" } } },
          },
        ],
      }),
    ).toBe(true)
  })

  it("accepts for loop with input.count and as", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "loop",
            mode: "for",
            id: "count",
            input: { count: 3 },
            as: "i",
            steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
            end: { input: { value: { $ref: "state.out" } } },
          },
        ],
      }),
    ).toBe(true)
  })

  it("rejects a loop without end", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "loop",
            id: "L",
            maxRounds: 1,
            steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
          },
        ],
      }),
    ).toBe(false)
  })

  it("rejects type branch", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "branch",
            id: "L",
            branches: [{ steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }] }],
          },
        ],
      }),
    ).toBe(false)
  })

  it("rejects maxRounds on forEach mode", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "loop",
            mode: "forEach",
            id: "L",
            input: { items: { $ref: "state.rows" } },
            as: "row",
            into: "results",
            maxRounds: 1,
            steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
            end: { input: { value: { $ref: "state.out" } } },
          },
        ],
      }),
    ).toBe(false)
  })

  it("rejects step expr gate", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            id: "gated",
            uses: "@executioncontrolprotocol/test.echo",
            expr: "true",
            input: { value: "x" },
          },
        ],
      }),
    ).toBe(false)
  })

  it("rejects type forEach (no schema arm)", () => {
    expect(
      validate({
        ...base,
        steps: [
          {
            type: "forEach",
            id: "L",
            as: "row",
            steps: [{ id: "s", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
          },
        ],
      }),
    ).toBe(false)
  })

  it("accepts plain transform script and rejects $script wrapper on step.script", () => {
    const plain = {
      ...base,
      steps: [
        {
          id: "t",
          uses: "@executioncontrolprotocol/core.transform",
          script: { lang: "js", source: "return input" },
        },
      ],
    }
    expect(validate(plain)).toBe(true)
    expect(
      validate({
        ...base,
        steps: [
          {
            id: "t",
            uses: "@executioncontrolprotocol/core.transform",
            script: { $script: { lang: "js", source: "return input" } },
          },
        ],
      }),
    ).toBe(false)
  })
})

describe("run event types", () => {
  it("accepts loop forEach lifecycle events", () => {
    const validate = ajv().compile(readJson(path.join(schemaDir, "run-event.schema.json")) as object)
    for (const type of [
      "loop.start",
      "loop.item.start",
      "loop.item.end",
      "loop.item.error",
      "loop.end",
    ] as const) {
      expect(validate({ seq: 1, at: "2026-11-14T00:00:00.000Z", type, data: { index: 0 } }), type).toBe(true)
    }
  })
})

describe("execution fixtures", () => {
  const compiler = ajv()
  const validate = compiler.compile(readJson(path.join(schemaDir, "execution.base.schema.json")) as object)
  const validDir = path.join(fixtureRoot, "manifests", "valid")
  const invalidDir = path.join(fixtureRoot, "manifests", "invalid")

  it("accepts every structurally valid fixture", () => {
    for (const name of readdirSync(validDir).filter((file) => file.endsWith(".ecp.json"))) {
      expect(validate(readJson(path.join(validDir, name))), name).toBe(true)
    }
  })

  it("accepts detached when non-empty and rejects an empty detached array", () => {
    const withDetached = readJson(path.join(invalidDir, "detached.ecp.json"))
    expect(validate(withDetached)).toBe(true)
    expect(validate({ ...withDetached, detached: [] })).toBe(false)
    expect(errorPaths(validate)).toContain("/detached")
  })

  it("rejects every schema-level invalid fixture at the expected path", () => {
    const names = readdirSync(invalidDir)
      .filter((file) => file.startsWith("schema-") && file.endsWith(".ecp.json"))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const manifest = readJson(path.join(invalidDir, name))
      const expected = readJson(path.join(invalidDir, name.replace(/\.ecp\.json$/, ".expected.json"))) as Array<{
        code: string
        path: string
        severity: string
      }>
      expect(validate(manifest), name).toBe(false)
      const paths = errorPaths(validate)
      const schemaIssues = expected.filter((issue) =>
        issue.code === "ECP_MANIFEST_INVALID" ||
        issue.code === "ECP_EXECUTION_LOAD" ||
        issue.code === "ECP_SCRIPT_INVALID",
      )
      expect(schemaIssues.length, name).toBeGreaterThan(0)
      for (const issue of schemaIssues) {
        expect(issue.severity).toBe("error")
        const hit = paths.some((pointer) => pointer === issue.path || pointer.startsWith(`${issue.path}/`) || issue.path.startsWith(pointer))
        expect(hit, `${name} expected ${issue.path} in ${paths.join(", ")}`).toBe(true)
      }
    }
  })

  it("pairs every run fixture with an expected result file", () => {
    const runDir = path.join(fixtureRoot, "manifests", "runs")
    const names = readdirSync(runDir).filter((file) => file.endsWith(".ecp.json"))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(validate(readJson(path.join(runDir, name))), name).toBe(true)
      const expected = readJson(path.join(runDir, name.replace(/\.ecp\.json$/, ".run.json"))) as {
        status: string
        steps: unknown[]
        events: string[]
      }
      expect(expected.status).toBeTruthy()
      expect(Array.isArray(expected.steps)).toBe(true)
      expect(expected.events[0]).toBe("run.start")
      expect(expected.events.at(-1)).toBe("run.end")
    }
  })
})
