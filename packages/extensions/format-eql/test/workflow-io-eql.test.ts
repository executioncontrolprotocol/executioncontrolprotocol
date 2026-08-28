import { describe, expect, it } from "vitest"
import {
  eqlTypeMapToJsonSchema,
  isWorkflowIoSchemaAbsent,
  jsonSchemaToEqlTypeMap,
  parseTypeAnnotationSpec,
} from "../src/workflow-io-eql.js"

describe("workflow-io-eql", () => {
  it("parses type annotation specs", () => {
    expect(parseTypeAnnotationSpec("value:string!")).toEqual({
      name: "value",
      eqlType: "string!",
    })
    expect(parseTypeAnnotationSpec("note:string")).toEqual({
      name: "note",
      eqlType: "string",
    })
    expect(parseTypeAnnotationSpec("invalid")).toBeUndefined()
    expect(parseTypeAnnotationSpec(":string")).toBeUndefined()
  })

  it("converts EQL type map to JSON Schema", () => {
    const schema = eqlTypeMapToJsonSchema({ value: "string!", count: "number" })
    expect(schema).toEqual({
      type: "object",
      properties: {
        value: { type: "string" },
        count: { type: "number" },
      },
      required: ["value"],
    })
  })

  it("round-trips all v1 types", () => {
    const typeMap = {
      text: "string!",
      count: "number",
      flag: "boolean!",
      data: "object",
      items: "array",
      kind: "integer",
      upload: "file!",
      extra: "unknown",
    }
    const schema = eqlTypeMapToJsonSchema(typeMap)
    expect(jsonSchemaToEqlTypeMap(schema)).toEqual(typeMap)
  })

  it("maps custom EQL types to JSON Schema type names", () => {
    const schema = eqlTypeMapToJsonSchema({ payload: "record" })
    expect(schema).toEqual({
      type: "object",
      properties: { payload: { type: "record" } },
    })
  })

  it("detects file fields from kind const without x-ecp-file", () => {
    const schema = {
      type: "object",
      properties: {
        upload: {
          type: "object",
          properties: { kind: { type: "string", const: "file" }, path: { type: "string" } },
        },
      },
      required: ["upload"],
    }
    expect(jsonSchemaToEqlTypeMap(schema)).toEqual({ upload: "file!" })
  })

  it("maps non-object schema properties to unknown", () => {
    const schema = {
      type: "object",
      properties: {
        value: { type: "string" },
        note: "free-form",
      },
      required: ["note"],
    }
    expect(jsonSchemaToEqlTypeMap(schema)).toEqual({
      value: "string",
      note: "unknown!",
    })
  })

  it("treats empty schema as absent", () => {
    expect(isWorkflowIoSchemaAbsent(undefined)).toBe(true)
    expect(isWorkflowIoSchemaAbsent({ type: "object", properties: {} })).toBe(true)
    expect(isWorkflowIoSchemaAbsent([] as unknown as Record<string, unknown>)).toBe(true)
    expect(
      isWorkflowIoSchemaAbsent({
        type: "object",
        properties: [] as unknown as Record<string, unknown>,
      })
    ).toBe(true)
    expect(
      isWorkflowIoSchemaAbsent({
        type: "object",
        properties: { value: { type: "string" } },
      })
    ).toBe(false)
  })
})
