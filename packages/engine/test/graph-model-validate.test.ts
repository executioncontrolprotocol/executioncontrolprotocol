import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"
import { manifestWithSteps } from "./manifest-helpers.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const invalidDir = path.resolve(here, "../../../fixtures/manifests/invalid")
const validDir = path.resolve(here, "../../../fixtures/manifests/valid")
const validNames = readdirSync(validDir).filter((name) => name.endsWith(".ecp.json")).sort()

function stubCapability(id: string) {
  return {
    id,
    plugin: id.split(".")[0] ?? id,
    package: id.split(".")[0] ?? id,
    pluginVersion: "0.0.0",
    summary: "",
    description: "",
    useCases: [],
    projections: [],
    accepts: { type: "object" },
    returns: { type: "object" },
  }
}

const echoCapability = stubCapability("@executioncontrolprotocol/test.echo")
const validationCapabilities = [
  echoCapability,
  stubCapability("@executioncontrolprotocol/core.transform"),
  stubCapability("@executioncontrolprotocol/test.bounded"),
  stubCapability("@executioncontrolprotocol/test.stage"),
  stubCapability("@executioncontrolprotocol/anthropic.generate"),
  stubCapability("@executioncontrolprotocol/adobe-firefly-services.photoshop-actions"),
]

const graphInvalid = [
  "schema-if-empty-then",
  "schema-loop-ref-and-expr",
  "schema-loop-ref-neither",
  "schema-loop-foreach-maxrounds",
  "schema-loop-foreach-throttle",
  "schema-loop-while-collect",
  "schema-loop-concurrency-zero",
  "schema-maxrounds-zero",
  "ref-parallel-sibling",
  "ref-maybe-branch",
  "ref-maybe-loop",
  "ref-maybe-missing",
  "commit-loop",
  "commit-parallel",
  "schema-until",
  "schema-when",
  "schema-type-foreach",
  "detached",
  "expr-syntax",
  "expr-async",
  "expr-two-params",
  "ref-unresolved",
  "schema-empty-steps",
  "returns-unresolved",
  "duplicate-id",
] as const

function loadManifest(name: string): ExecutionManifest {
  return JSON.parse(readFileSync(path.join(invalidDir, `${name}.ecp.json`), "utf8")) as ExecutionManifest
}

function loadExpected(name: string): Array<{ code: string; path: string; severity?: string }> {
  return JSON.parse(readFileSync(path.join(invalidDir, `${name}.expected.json`), "utf8"))
}

describe("graph model invalid manifests", () => {
  it.each(graphInvalid)("%s matches expected validation issues", async (name) => {
    const manifest = loadManifest(name)
    const expected = loadExpected(name)
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    for (const issue of expected) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: issue.code, path: issue.path, severity: issue.severity ?? "error" }),
      )
    }
  })

  it("rejects parallel with fewer than two paths", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        paths: [[{ id: "only", uses: echoCapability.id, input: { value: "x" } }]],
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path.includes("/paths"))).toBe(true)
  })

  it("rejects for loop without count", async () => {
    const manifest = manifestWithSteps([
      {
        type: "loop",
        id: "f",
        mode: "for",
        as: "i",
        steps: [{ id: "b", uses: echoCapability.id, input: { value: "x" } }],
        end: { input: { value: 0 } },
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path.includes("/count"))).toBe(true)
  })

  it("rejects forEach without items or as", async () => {
    const manifest = manifestWithSteps([
      {
        type: "loop",
        id: "fe",
        mode: "forEach",
        steps: [],
        end: { input: { value: { $ref: "state.x" } } },
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
  })

  it("rejects if with both expression and script", async () => {
    const manifest = manifestWithSteps([
      {
        type: "if",
        id: "both",
        expression: "true",
        script: { source: "return true", lang: "js" },
        then: [{ id: "t", uses: echoCapability.id, input: { value: "t" } }],
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
  })

  it("rejects nested step id collision across parallel paths", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        paths: [
          [{ id: "dup", uses: echoCapability.id, input: { value: "a" } }],
          [{ id: "dup", uses: echoCapability.id, input: { value: "b" } }],
        ],
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it.each(
    validNames.filter(
      (name) =>
        !name.startsWith("script-") &&
        name !== "localize-banner.ecp.json" &&
        name !== "loop-foreach.ecp.json" &&
        name !== "markers.ecp.json",
    ),
  )("valid fixture %s has no validation errors", async (name) => {
    const manifest = JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
    const result = await validateExecution(manifest, { capabilities: validationCapabilities })
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
  })

  it("rejects parallel maxConcurrency below one", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        maxConcurrency: 0,
        paths: [
          [{ id: "a", uses: echoCapability.id, input: { value: "a" } }],
          [{ id: "b", uses: echoCapability.id, input: { value: "b" } }],
        ],
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.path?.includes("maxConcurrency"))).toBe(true)
  })

  it("rejects forEach loop with throttle", async () => {
    const manifest = manifestWithSteps([
      {
        type: "loop",
        mode: "forEach",
        id: "fe",
        as: "row",
        input: { items: { $ref: "state.rows" } },
        throttle: 1,
        steps: [],
        end: { input: { value: { $ref: "state.x" } } },
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
  })

  it("rejects parallel and if scoped as without input", async () => {
    const parallel = await validateExecution(
      manifestWithSteps([
        {
          type: "parallel",
          id: "p",
          as: "ctx",
          paths: [
            [{ id: "a", uses: echoCapability.id, input: { value: "a" } }],
            [{ id: "b", uses: echoCapability.id, input: { value: "b" } }],
          ],
        },
      ]),
      { capabilities: [echoCapability] },
    )
    expect(parallel.issues.some((issue) => issue.path === "/steps/0/as")).toBe(true)
    const gate = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "g",
          expression: "true",
          as: "ctx",
          then: [{ id: "t", uses: echoCapability.id, input: { value: "t" } }],
        },
      ]),
      { capabilities: [echoCapability] },
    )
    expect(gate.issues.some((issue) => issue.path === "/steps/0/as")).toBe(true)
  })

  it("rejects malformed if expression syntax", async () => {
    const manifest = manifestWithSteps([
      {
        type: "if",
        id: "g",
        expression: "(((",
        then: [{ id: "t", uses: echoCapability.id, input: { value: "t" } }],
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_EXPR_INVALID")).toBe(true)
  })

  it("warns on unreachable returns properties", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: { returns: { type: "object", properties: { ghost: { type: "string" } } } },
      steps: [{ id: "only", uses: echoCapability.id, input: { value: "x" }, as: "only" }],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_RETURNS_UNRESOLVED")).toBe(true)
  })

  it("rejects a capability step without uses", async () => {
    const manifest = manifestWithSteps([
      { id: "orphan", input: { value: "x" }, as: "orphan" } as ExecutionManifest["steps"][0],
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
  })

  it("rejects while loop without maxRounds", async () => {
    const manifest = manifestWithSteps([
      {
        type: "loop",
        id: "w",
        mode: "while",
        steps: [],
        end: { input: { repeat: false } },
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.path?.includes("maxRounds"))).toBe(true)
  })

  it("rejects loop end without repeat or value for while", async () => {
    const manifest = manifestWithSteps([
      {
        type: "loop",
        id: "w",
        mode: "while",
        maxRounds: 2,
        steps: [],
        end: { input: {} },
      },
    ])
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.valid).toBe(false)
  })
})
