import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { CapabilityEntry, PluginSchemaDocument } from "@executioncontrolprotocol/protocol"
import {
  generateEditorRootSchema,
  generatePluginEditorSchema,
  pluginIdFromSafeFileName,
  safePluginId,
  wrapValue,
} from "../src/index.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const validateSource = readFileSync(path.join(here, "../src/validate/validate.ts"), "utf8")
const operationsSource = readFileSync(path.join(here, "../src/operations/operations.ts"), "utf8")
const markersSource = readFileSync(path.join(here, "../src/validate/markers.ts"), "utf8")

const echo: CapabilityEntry = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/plugin-test",
  pluginVersion: "1.0.0",
  summary: "Echo",
  description: "Echo",
  useCases: [],
  projections: [],
}

const document: PluginSchemaDocument = {
  $id: "ecp://plugins/@executioncontrolprotocol/test/1.0.0/schema.json",
  $defs: {
    "echo.accepts": {
      type: "object",
      properties: { value: { type: "string" } },
    },
    "echo.returns": {
      type: "object",
      properties: { echo: {} },
    },
  },
}

describe("safePluginId", () => {
  it("encodes scoped ids without path separators and round-trips", () => {
    const id = "@executioncontrolprotocol/test"
    const safe = safePluginId(id)
    expect(safe).not.toContain("/")
    expect(safe).not.toContain("\\")
    expect(pluginIdFromSafeFileName(safe)).toBe(id)
    expect(pluginIdFromSafeFileName(`${safe}.editor.schema.json`)).toBe(id)
  })

  it("keeps distinct ids collision-free", () => {
    const a = safePluginId("@scope/a")
    const b = safePluginId("@scope/b")
    const c = safePluginId("@scope_a")
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe("generateEditorRootSchema", () => {
  it("uses relative $refs only (no inlined wrap blobs)", () => {
    const root = generateEditorRootSchema([echo])
    const text = JSON.stringify(root)
    expect(text).toContain(
      `plugins/${safePluginId(echo.plugin)}.editor.schema.json#/$defs/echo.editorInput`,
    )
    const allOf = (root.$defs as { step: { allOf: Array<{ then: { properties: { input: unknown } } }> } }).step
      .allOf
    for (const branch of allOf) {
      expect(branch.then.properties.input).toEqual({
        $ref: `plugins/${safePluginId(echo.plugin)}.editor.schema.json#/$defs/echo.editorInput`,
      })
    }
    expect((root.$defs as { step: { properties: { uses: { enum: string[] } } } }).step.properties.uses.enum).toEqual([
      echo.id,
    ])
  })
})

describe("generatePluginEditorSchema", () => {
  it("writes wrapped editorInput defs", () => {
    const plugin = generatePluginEditorSchema(echo.plugin, [echo], document)
    const defs = plugin.$defs as Record<string, unknown>
    expect(defs["echo.editorInput"]).toEqual(wrapValue(document.$defs["echo.accepts"]!))
    expect(defs["echo.returns"]).toEqual(document.$defs["echo.returns"])
  })
})

describe("wrapValue", () => {
  it("rejects $secret at the outer layer", () => {
    const wrapped = wrapValue({ type: "string" })
    expect(wrapped).toMatchObject({
      if: { required: ["$secret"] },
      then: false,
    })
  })

  it("allows $script on open schemas", () => {
    const wrapped = wrapValue({})
    expect(JSON.stringify(wrapped)).toContain('"$ref":"#/$defs/scriptValue"')
  })

  it("rejects $script on closed number fields", () => {
    const wrapped = wrapValue({ type: "number" })
    expect(JSON.stringify(wrapped)).toContain('{"if":{"type":"object","required":["$script"]},"then":false')
  })
})

describe("runtime validation does not import editor wrap helpers", () => {
  it("keeps validate.ts and operations.ts free of editor-schema / wrapValue imports", () => {
    for (const source of [validateSource, operationsSource]) {
      expect(source).not.toMatch(/editor-schema/)
      expect(source).not.toMatch(/wrapValue/)
      expect(source).not.toMatch(/generateEditorRootSchema/)
      expect(source).not.toMatch(/generatePluginEditorSchema/)
      expect(source).not.toMatch(/generateExecutionSchema/)
    }
    expect(markersSource).not.toMatch(/wrapValue/)
    expect(markersSource).not.toMatch(/editor-schema/)
  })
})
