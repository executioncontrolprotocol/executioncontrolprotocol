import Ajv2020 from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import { describe, expect, it } from "vitest"
import {
  allowsString,
  assertScriptPositions,
  collectMarkerPaths,
  collectSecretEnvIssues,
  filterMarkerExplainedErrors,
  isOpenSchema,
  subschemasAt,
  validateWithMarkers,
} from "../src/index.js"

const Ajv = Ajv2020 as unknown as new (options?: object) => {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: Array<Record<string, unknown>> | null }
}
const addFormats = addFormatsModule as unknown as (ajv: unknown) => unknown

const fireflyLike = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "size", "outputs"],
  properties: {
    prompt: { type: "string", maxLength: 100 },
    size: {
      type: "object",
      additionalProperties: false,
      required: ["width"],
      properties: { width: { type: "integer" }, height: { type: "integer" } },
    },
    source: {
      anyOf: [
        { type: "object", required: ["url"], additionalProperties: false, properties: { url: { type: "string" } } },
        { type: "object", required: ["path"], additionalProperties: false, properties: { path: { type: "string" } } },
      ],
    },
    outputs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["mediaType"],
        properties: { mediaType: { enum: ["image/png", "image/jpeg"] } },
      },
    },
  },
}

function compile(schema: object) {
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}

describe("validateWithMarkers (scale3 cases)", () => {
  const validate = compile(fireflyLike)

  it("accepts literals and markers at string, object, array, and anyOf positions", () => {
    expect(
      validateWithMarkers(validate, {
        prompt: "hi",
        size: { width: 1 },
        outputs: [{ mediaType: "image/png" }],
      }),
    ).toEqual([])
    expect(
      validateWithMarkers(validate, {
        prompt: { $expr: "(s) => s.x" },
        size: { $ref: "state.doc.size" },
        outputs: { $ref: "state.outs" },
      }),
    ).toEqual([])
    expect(
      validateWithMarkers(validate, {
        prompt: "x",
        size: { width: { $ref: "state.w" } },
        source: { url: { $ref: "state.u" } },
        outputs: [{ mediaType: "image/png" }],
      }),
    ).toEqual([])
    expect(
      validateWithMarkers(validate, {
        prompt: { $script: { lang: "js", source: "x" } },
        size: { width: 1 },
        outputs: [{ mediaType: "image/jpeg" }],
      }),
    ).toEqual([])
  })

  it("keeps real failures: typo field, bad enum beside marker, anyOf miss, wrong type", () => {
    expect(
      validateWithMarkers(validate, {
        promt: "x",
        size: { width: 1 },
        outputs: [{ mediaType: "image/png" }],
      }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      validateWithMarkers(validate, {
        prompt: { $ref: "state.p" },
        size: { width: 1 },
        outputs: [{ mediaType: "image/gif" }],
      }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      validateWithMarkers(validate, {
        prompt: "x",
        size: { width: 1 },
        source: { file: "y" },
        outputs: [{ mediaType: "image/png" }],
      }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      validateWithMarkers(validate, {
        prompt: 5,
        size: { $ref: "state.s" },
        outputs: [{ mediaType: "image/png" }],
      }).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it("explains anyOf when a marker sits inside one matching branch", () => {
    const marks = collectMarkerPaths({ url: { $ref: "state.u" } })
    expect(marks.has("/url")).toBe(true)
    const nested = {
      prompt: "x",
      size: { width: 1 },
      source: { url: { $ref: "state.u" } },
      outputs: [{ mediaType: "image/png" }],
    }
    expect(validateWithMarkers(validate, nested)).toEqual([])
  })

  it("does not explain anyOf when no branch matches", () => {
    const errs = validateWithMarkers(validate, {
      prompt: "x",
      size: { width: 1 },
      source: { file: "y" },
      outputs: [{ mediaType: "image/png" }],
    })
    expect(errs.some((error) => error.keyword === "anyOf" || error.instancePath.includes("/source"))).toBe(true)
  })
})

describe("open-object and script position rules", () => {
  it("rule (a): open object undeclared property accepts $script", () => {
    const accepts = { type: "object", properties: { value: {} } }
    expect(subschemasAt(accepts, "/script")).toContain(true)
    expect(assertScriptPositions({ script: { $script: { lang: "js", source: "1" } } }, accepts, "/steps/0/input")).toEqual(
      [],
    )
  })

  it("rule (a) negative: closed object has no subschema for undeclared $script", () => {
    const accepts = {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" } },
      required: ["text"],
    }
    expect(subschemasAt(accepts, "/script")).toEqual([])
    expect(
      assertScriptPositions(
        { text: "ok", script: { $script: { lang: "js", source: "1" } } },
        accepts,
        "/steps/0/input",
      ),
    ).toEqual([
      expect.objectContaining({
        code: "ECP_MANIFEST_INVALID",
        path: "/steps/0/input/script",
      }),
    ])
  })

  it("rejects $script where a string is not accepted", () => {
    const accepts = {
      type: "object",
      properties: { count: { type: "integer" } },
      additionalProperties: false,
    }
    const issues = assertScriptPositions(
      { count: { $script: { lang: "js", source: "1" } } },
      accepts,
      "/steps/0/input",
    )
    expect(issues).toEqual([
      expect.objectContaining({
        code: "ECP_MANIFEST_INVALID",
        path: "/steps/0/input/count",
      }),
    ])
  })

  it("allows $script on string and open schemas; allowsString covers anyOf", () => {
    expect(allowsString({ type: "string" })).toBe(true)
    expect(allowsString({})).toBe(true)
    expect(isOpenSchema({})).toBe(true)
    expect(allowsString({ type: "integer" })).toBe(false)
    expect(allowsString({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe(true)
  })
})

describe("filterMarkerExplainedErrors edges", () => {
  it("drops type/format/enum under a marker and keeps sibling failures", () => {
    const marks = collectMarkerPaths({
      prompt: { $ref: "state.p" },
      outputs: [{ mediaType: "image/gif" }],
    })
    const filtered = filterMarkerExplainedErrors(
      [
        {
          instancePath: "/prompt",
          schemaPath: "#/properties/prompt/type",
          keyword: "type",
          params: {},
          message: "must be string",
        },
        {
          instancePath: "/outputs/0/mediaType",
          schemaPath: "#/properties/outputs/items/properties/mediaType/enum",
          keyword: "enum",
          params: {},
          message: "must be equal to one of the allowed values",
        },
      ],
      marks,
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.instancePath).toBe("/outputs/0/mediaType")
  })

  it("drops additionalProperties when the extra key is a marker", () => {
    const marks = new Map([["/extra", "$expr" as const]])
    const filtered = filterMarkerExplainedErrors(
      [
        {
          instancePath: "",
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: "extra" },
          message: "must NOT have additional properties",
        },
      ],
      marks,
    )
    expect(filtered).toEqual([])
  })

  it("collects markers nested in arrays", () => {
    const marks = collectMarkerPaths({ items: [{ n: 1 }, { n: { $ref: "state.x" } }] })
    expect(marks.get("/items/1/n")).toBe("$ref")
  })
})

describe("collectSecretEnvIssues", () => {
  it("emits F3-shaped issues for $secret and $env", () => {
    const issues = collectSecretEnvIssues({
      steps: [{ input: { value: { $secret: "k" }, nested: { env: { $env: "PATH" } } } }],
    })
    expect(issues).toEqual([
      expect.objectContaining({
        code: "ECP_MANIFEST_INVALID",
        path: "/steps/0/input/value",
        message: expect.stringContaining("$secret"),
        suggestions: expect.any(Array),
      }),
      expect.objectContaining({
        code: "ECP_MANIFEST_INVALID",
        path: "/steps/0/input/nested/env",
        message: expect.stringContaining("$env"),
      }),
    ])
  })
})
