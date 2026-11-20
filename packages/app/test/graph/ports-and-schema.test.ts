import type { ExecutionManifest, StepNode } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  ensureInputPort,
  ensureOutputPort,
  executionToReactFlow,
  fileRefValueSchemaHint,
  flattenJsonSchemaProperties,
  formatLiteralValue,
  isFileValueSchemaHint,
  jsonSchemaObjectProperties,
  portsForStep,
  portsFromJsonSchemaObject,
  truncateLiteralPreview,
  typeLabelFromSchema,
  valueSchemaFromEqlLabel,
  valueSchemaFromJsonSchemaProp,
  valueSchemasFromCapabilitySchema,
  type ReactFlowPort,
  type ReactFlowStepData,
} from "../../src/graph/index.js"

describe("executionToReactFlow capability schemas", () => {
  const manifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        id: "echo",
        uses: "@executioncontrolprotocol/test.echo",
        input: { value: "hi" },
        as: "out",
      },
    ],
  }

  it("yields a real typeLabel when accepts is provided", () => {
    const doc = executionToReactFlow(manifest, {
      capabilitySchemas: {
        "@executioncontrolprotocol/test.echo": {
          accepts: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        },
      },
    })
    const step = doc.nodes.find((n) => n.id === "echo")!.data as ReactFlowStepData
    expect(step.inputs.find((p) => p.id === "value")?.typeLabel).toBe("string!")
    expect(step.inputs.find((p) => p.id === "value")?.typeLabel).not.toBe("unknown")
  })

  it("keeps unknown when the capability schema is missing", () => {
    const doc = executionToReactFlow(manifest)
    const step = doc.nodes.find((n) => n.id === "echo")!.data as ReactFlowStepData
    expect(step.inputs.find((p) => p.id === "value")?.typeLabel).toBe("unknown")
  })
})

describe("formatLiteralValue / truncateLiteralPreview", () => {
  it("formats primitives and JSON", () => {
    expect(formatLiteralValue("s")).toBe("s")
    expect(formatLiteralValue(null)).toBe("null")
    expect(formatLiteralValue(3)).toBe("3")
    expect(formatLiteralValue(false)).toBe("false")
    expect(formatLiteralValue(undefined)).toBe("undefined")
    expect(formatLiteralValue({ a: [1] })).toBe('{"a":[1]}')
  })

  it("falls back to String for unserialisable values", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatLiteralValue(cyclic)).toBe("[object Object]")
    expect(formatLiteralValue(10n)).toBe("10")
  })

  it("truncates with an ellipsis at the limit", () => {
    expect(truncateLiteralPreview("abc", 3)).toBe("abc")
    expect(truncateLiteralPreview("abcd", 3)).toBe("ab\u2026")
    expect(truncateLiteralPreview("x".repeat(80))).toHaveLength(56)
  })
})

describe("ensureInputPort / ensureOutputPort", () => {
  it("adds missing ports once", () => {
    const outputs: ReactFlowPort[] = []
    ensureOutputPort(outputs, "a")
    ensureOutputPort(outputs, "a")
    expect(outputs).toEqual([{ id: "a", name: "a", typeLabel: "unknown" }])
    const inputs: ReactFlowPort[] = []
    ensureInputPort(inputs, "expr")
    ensureInputPort(inputs, "v.k")
    ensureInputPort(inputs, "v.k")
    expect(inputs.map((p) => [p.id, p.typeLabel, p.binding])).toEqual([
      ["expr", "expr", "expr"],
      ["v.k", "unknown", undefined],
    ])
  })
})

describe("portsForStep", () => {
  it("keeps input order from accepts, adds unknown input keys, binds every marker kind", () => {
    const step: StepNode = {
      id: "s",
      uses: "@x/p.c",
      expr: "(state) => true",
      input: {
        a: "lit",
        extra: { $expr: "(state) =>   state.q" },
        s: { $script: { lang: "js", path: "x.js", params: { p: { $ref: "state.k" } } } },
        both: { $script: { lang: "js", source: "1", path: "ignored-preview.js" } },
        list: [{ $ref: "state.k.items" }, { $expr: "(s) => s.k" }, { $script: { lang: "js", source: "2" } }],
      },
    }
    const ports = portsForStep(step, {
      accepts: { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a"] },
    })
    const byId = new Map(ports.inputs.map((p) => [p.id, p]))
    expect([...byId.keys()]).toEqual(["a", "b", "extra", "s", "both", "list", "list.2", "list.0", "list.1", "expr"])
    expect(byId.get("a")).toMatchObject({ typeLabel: "string!", binding: "literal", valuePreview: "lit", valueSchema: { type: "string" } })
    expect(byId.get("b")?.binding).toBeUndefined()
    expect(byId.get("extra")).toMatchObject({ binding: "expr", valuePreview: "(state) => state.q" })
    expect(byId.get("s")).toMatchObject({ binding: "script", scriptPath: "x.js" })
    expect(byId.get("both")).toMatchObject({ scriptSource: "1", scriptPath: "ignored-preview.js", valuePreview: "1" })
    expect(byId.get("list")).toMatchObject({ binding: "literal" })
    expect(byId.get("list.0")).toMatchObject({ binding: "ref", refPath: "k.items" })
    expect(byId.get("list.1")).toMatchObject({ binding: "expr", exprSource: "(s) => s.k" })
    expect(byId.get("list.2")).toMatchObject({ binding: "script", scriptSource: "2" })
    expect(byId.get("expr")).toMatchObject({ binding: "expr", exprSource: "(state) => true" })
  })

  it("does not let a nested script param ref replace the script binding", () => {
    const ports = portsForStep({
      id: "s",
      uses: "@x/p.c",
      input: { o: { inner: { $script: { lang: "js", source: "x", params: { p: { $ref: "state.k" } } } } } },
    })
    expect(ports.inputs.find((p) => p.id === "o.inner")).toMatchObject({ binding: "script", scriptSource: "x" })
  })

  it("prefers step accepts and returns over capability schemas", () => {
    const ports = portsForStep(
      {
        id: "t",
        uses: "@executioncontrolprotocol/core.transform",
        accepts: { type: "object", properties: { name: { type: "string" } } },
        returns: { type: "object", properties: { greeting: { type: "string" } } },
      },
      {
        accepts: { type: "object", properties: { other: { type: "number" } } },
        returns: { type: "object", properties: { ignored: { type: "boolean" } } },
      },
    )
    expect(ports.inputs.map((p) => p.id)).toEqual(["name"])
    expect(ports.outputs.some((p) => p.id === "greeting")).toBe(true)
    expect(ports.outputs.some((p) => p.id === "ignored")).toBe(false)
  })

  it("keeps a declared output port named output and types nested outputs", () => {
    const ports = portsForStep(
      { id: "s", uses: "@x/p.c" },
      { returns: { type: "object", properties: { output: { type: "string" }, f: { "x-ecp-file": true } }, required: ["output"] } },
    )
    expect(ports.outputs.map((p) => [p.id, p.typeLabel])).toEqual([
      ["output", "string!"],
      ["f", "file"],
    ])
    expect(ports.inputs).toEqual([])
  })

  it("non-optional $ref has no refOptional flag; malformed state ref keeps the raw path", () => {
    const ports = portsForStep({ id: "s", uses: "@x/p.c", input: { a: { $ref: "state.k" }, b: { $ref: "state." } } })
    expect(ports.inputs[0]).toMatchObject({ binding: "ref", refPath: "k" })
    expect(ports.inputs[0]?.refOptional).toBeUndefined()
    expect(ports.inputs[1]).toMatchObject({ binding: "ref", refPath: "state." })
  })
})

describe("JSON Schema helpers", () => {
  it("lists properties with required flags and ignores non-objects", () => {
    expect(jsonSchemaObjectProperties({ properties: { a: true, b: {} }, required: ["b", 1] })).toEqual([
      { name: "a", schema: {}, required: false },
      { name: "b", schema: {}, required: true },
    ])
    expect(jsonSchemaObjectProperties(null)).toEqual([])
    expect(jsonSchemaObjectProperties({ properties: [] })).toEqual([])
  })

  it("flattens nested objects but not arrays, enums, files or primitives", () => {
    const schema = {
      type: "object",
      required: ["o"],
      properties: {
        o: {
          type: "object",
          required: ["x"],
          properties: { x: { type: "string" }, deep: { properties: { y: { type: "number" } } } },
        },
        arr: { type: "array", properties: { no: {} } },
        file: { "x-ecp-file": true, properties: { no: {} } },
        en: { enum: ["a"], properties: { no: {} } },
        prim: { type: "string", properties: { no: {} } },
      },
    }
    expect(flattenJsonSchemaProperties(schema).map((f) => [f.name, f.required])).toEqual([
      ["o", true],
      ["o.x", true],
      ["o.deep", false],
      ["o.deep.y", false],
      ["arr", false],
      ["file", false],
      ["en", false],
      ["prim", false],
    ])
  })

  it("stops on cycles and depth", () => {
    const cyclic: Record<string, unknown> = { type: "object" }
    cyclic.properties = { self: cyclic }
    expect(flattenJsonSchemaProperties(cyclic).map((f) => f.name)).toEqual(["self"])
    let deep: Record<string, unknown> = { type: "string" }
    for (let i = 0; i < 12; i += 1) deep = { type: "object", properties: { n: deep } }
    expect(flattenJsonSchemaProperties(deep).length).toBeLessThan(12)
  })

  it("portsFromJsonSchemaObject types I/O ports", () => {
    expect(
      portsFromJsonSchemaObject({ properties: { a: { type: "integer" }, b: { enum: [1] }, c: {} }, required: ["a"] }).map((p) => [
        p.id,
        p.typeLabel,
        p.required,
      ]),
    ).toEqual([
      ["a", "integer!", true],
      ["b", "enum", false],
      ["c", "unknown", false],
    ])
  })
})

describe("value schema hints", () => {
  it("detects file refs in every supported shape", () => {
    expect(isFileValueSchemaHint(fileRefValueSchemaHint())).toBe(true)
    expect(isFileValueSchemaHint({ contentMediaType: "image/png" })).toBe(true)
    expect(isFileValueSchemaHint({ contentMediaType: ["image/png"] })).toBe(true)
    expect(isFileValueSchemaHint({ format: "binary" })).toBe(true)
    expect(isFileValueSchemaHint({ format: "byte" })).toBe(true)
    expect(isFileValueSchemaHint({ type: "object", properties: { kind: { enum: ["url"] } } })).toBe(true)
  })

  it("rejects non-file schemas", () => {
    expect(isFileValueSchemaHint({ type: "string" })).toBe(false)
    expect(isFileValueSchemaHint({ contentMediaType: "" })).toBe(false)
    expect(isFileValueSchemaHint({ contentMediaType: [] })).toBe(false)
    expect(isFileValueSchemaHint({ type: "object", properties: { kind: { enum: ["buffer"] } } })).toBe(false)
    expect(isFileValueSchemaHint({ type: "object", properties: { kind: { type: "string" } } })).toBe(false)
    expect(isFileValueSchemaHint({ type: "object", properties: {} })).toBe(false)
  })

  it("maps type labels to schemas", () => {
    expect(valueSchemaFromEqlLabel("string!")).toEqual({ type: "string" })
    expect(valueSchemaFromEqlLabel("float")).toEqual({ type: "number" })
    expect(valueSchemaFromEqlLabel("int")).toEqual({ type: "integer" })
    expect(valueSchemaFromEqlLabel("bool")).toEqual({ type: "boolean" })
    expect(valueSchemaFromEqlLabel("null")).toEqual({ type: "null" })
    expect(valueSchemaFromEqlLabel("array")).toEqual({ type: "array" })
    expect(valueSchemaFromEqlLabel("json")).toEqual({ type: "object" })
    expect(valueSchemaFromEqlLabel("file")?.["x-ecp-file"]).toBe(true)
    expect(valueSchemaFromEqlLabel("unknown")).toBeUndefined()
    expect(valueSchemaFromEqlLabel("")).toBeUndefined()
    expect(valueSchemaFromEqlLabel("widget")).toBeUndefined()
  })

  it("clones property schemas and maps capability schemas", () => {
    const prop = { type: "string" }
    expect(valueSchemaFromJsonSchemaProp(prop)).not.toBe(prop)
    expect(valueSchemaFromJsonSchemaProp([])).toBeUndefined()
    expect([...valueSchemasFromCapabilitySchema({ properties: { a: prop, b: 1 } }).keys()]).toEqual(["a"])
    expect(valueSchemasFromCapabilitySchema("x").size).toBe(0)
    expect(valueSchemasFromCapabilitySchema({}).size).toBe(0)
  })

  it("labels types", () => {
    expect(typeLabelFromSchema(undefined, false)).toBe("unknown")
    expect(typeLabelFromSchema({ "x-ecp-file": true }, true)).toBe("file!")
    expect(typeLabelFromSchema({ type: "boolean" }, true)).toBe("boolean!")
  })
})
