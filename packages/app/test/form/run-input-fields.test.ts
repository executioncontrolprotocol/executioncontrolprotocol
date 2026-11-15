import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  collectRunInput,
  enumOptionDraft,
  initialRunInputDraft,
  parseRunInputDraft,
  runInputFields,
  type RunInputField,
} from "../../src/form/run-input-fields.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validDir = path.resolve(here, "../../../../fixtures/manifests/valid")

const accepts = {
  type: "object",
  properties: {
    name: { type: "string", title: "Name", description: "Who to greet" },
    count: { type: "number", default: 2 },
    rounds: { type: "integer" },
    on: { type: "boolean" },
    flag: { type: "boolean", default: true },
    color: { type: "string", enum: ["red", "blue"] },
    level: { enum: [1, 2] },
    fixed: { const: "only" },
    meta: { type: "object", default: { a: 1 } },
    tags: { type: "array" },
    nullable: { type: ["null", "string"] },
    anything: {},
  },
  required: ["name", "on", "rounds"],
}

function field(name: string): RunInputField {
  const found = runInputFields(accepts).find((f) => f.name === name)
  if (!found) throw new Error(name)
  return found
}

describe("runInputFields", () => {
  it("maps every JSON Schema type to a control kind in property order", () => {
    expect(runInputFields(accepts).map((f) => [f.name, f.kind, f.required])).toEqual([
      ["name", "string", true],
      ["count", "number", false],
      ["rounds", "integer", true],
      ["on", "boolean", true],
      ["flag", "boolean", false],
      ["color", "enum", false],
      ["level", "enum", false],
      ["fixed", "enum", false],
      ["meta", "json", false],
      ["tags", "json", false],
      ["nullable", "string", false],
      ["anything", "json", false],
    ])
  })

  it("keeps labels, descriptions, defaults, enum values and JSON types", () => {
    expect(field("name")).toMatchObject({ label: "Name", description: "Who to greet" })
    expect(field("count")).toMatchObject({ label: "count", defaultValue: 2 })
    expect(field("color").enumValues).toEqual(["red", "blue"])
    expect(field("fixed").enumValues).toEqual(["only"])
    expect(field("meta").jsonType).toBe("object")
    expect(field("tags").jsonType).toBe("array")
    expect(field("anything").jsonType).toBeUndefined()
  })

  it("returns no fields for missing or property-less schemas", () => {
    expect(runInputFields(undefined)).toEqual([])
    expect(runInputFields({ type: "object" })).toEqual([])
  })

  it("covers every accepts schema in the valid fixtures", () => {
    for (const name of readdirSync(validDir).filter((n) => n.endsWith(".ecp.json"))) {
      const manifest = JSON.parse(readFileSync(path.join(validDir, name), "utf8")) as ExecutionManifest
      const fields = runInputFields(manifest.execution?.accepts)
      const props = Object.keys((manifest.execution?.accepts?.properties as object | undefined) ?? {})
      expect(fields.map((f) => f.name)).toEqual(props)
      for (const f of fields) expect(f.kind).not.toBe("json")
    }
  })
})

describe("initialRunInputDraft", () => {
  it("uses defaults and sensible empties", () => {
    expect(initialRunInputDraft(field("count"))).toBe("2")
    expect(initialRunInputDraft(field("on"))).toBe("false")
    expect(initialRunInputDraft(field("flag"))).toBe("true")
    expect(initialRunInputDraft(field("name"))).toBe("")
    expect(initialRunInputDraft(field("meta"))).toBe('{\n  "a": 1\n}')
    expect(initialRunInputDraft({ ...field("color"), defaultValue: "blue" })).toBe('"blue"')
  })
})

describe("parseRunInputDraft", () => {
  it("parses each kind", () => {
    expect(parseRunInputDraft(field("name"), " Ada ")).toEqual({ ok: true, value: " Ada " })
    expect(parseRunInputDraft(field("count"), "2.5")).toEqual({ ok: true, value: 2.5 })
    expect(parseRunInputDraft(field("rounds"), "3")).toEqual({ ok: true, value: 3 })
    expect(parseRunInputDraft(field("on"), "true")).toEqual({ ok: true, value: true })
    expect(parseRunInputDraft(field("on"), "false")).toEqual({ ok: true, value: false })
    expect(parseRunInputDraft(field("color"), enumOptionDraft("blue"))).toEqual({ ok: true, value: "blue" })
    expect(parseRunInputDraft(field("level"), enumOptionDraft(2))).toEqual({ ok: true, value: 2 })
    expect(parseRunInputDraft(field("meta"), '{"x":1}')).toEqual({ ok: true, value: { x: 1 } })
    expect(parseRunInputDraft(field("tags"), "[1]")).toEqual({ ok: true, value: [1] })
    expect(parseRunInputDraft(field("anything"), "null")).toEqual({ ok: true, value: null })
  })

  it("rejects bad values with a message", () => {
    expect(parseRunInputDraft(field("count"), "abc")).toEqual({ ok: false, error: "Enter a number." })
    expect(parseRunInputDraft(field("rounds"), "1.5")).toEqual({ ok: false, error: "Enter a whole number." })
    expect(parseRunInputDraft(field("on"), "yes")).toEqual({ ok: false, error: "Choose true or false." })
    expect(parseRunInputDraft(field("color"), '"green"')).toEqual({ ok: false, error: "Choose one of the listed values." })
    expect(parseRunInputDraft(field("meta"), "[]")).toEqual({ ok: false, error: "Enter a JSON object." })
    expect(parseRunInputDraft(field("tags"), "{}")).toEqual({ ok: false, error: "Enter a JSON array." })
    const bad = parseRunInputDraft(field("meta"), "{oops")
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error.startsWith("Invalid JSON:")).toBe(true)
  })

  it("omits empty optional fields and fails empty required ones", () => {
    expect(parseRunInputDraft(field("count"), "  ")).toEqual({ ok: true, omit: true })
    expect(parseRunInputDraft(field("name"), "")).toEqual({ ok: false, error: "Required." })
    expect(parseRunInputDraft({ ...field("color"), enumValues: undefined }, '"red"')).toEqual({
      ok: false,
      error: "Choose one of the listed values.",
    })
  })
})

describe("collectRunInput", () => {
  const fields = runInputFields(accepts)

  it("collects parsed values and skips omitted ones", () => {
    const result = collectRunInput(fields, { name: "Ada", on: "true", rounds: "1", count: "", color: '"red"' })
    expect(result).toEqual({ ok: true, input: { name: "Ada", on: true, rounds: 1, color: "red" } })
  })

  it("returns every field error at once", () => {
    const result = collectRunInput(fields, { on: "maybe", rounds: "x" })
    expect(result).toEqual({
      ok: false,
      errors: { name: "Required.", on: "Choose true or false.", rounds: "Enter a number." },
    })
  })

  it("accepts an empty form when nothing is required", () => {
    expect(collectRunInput([], {})).toEqual({ ok: true, input: {} })
  })
})
