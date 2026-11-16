import type { CapabilityEntry } from "@executioncontrolprotocol/protocol"
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }
import { allowsString } from "../validate/markers.js"

/**
 * A JSON Schema object.
 * @category Validation
 */
export type JsonSchema = Record<string, unknown>

const REF_VALUE: JsonSchema = { $ref: "#/$defs/refValue" }
const EXPR_VALUE: JsonSchema = { $ref: "#/$defs/exprValue" }
const STATE_VALUE: JsonSchema = { $ref: "#/$defs/stateValue" }
const SCRIPT_VALUE: JsonSchema = { $ref: "#/$defs/scriptValue" }

/**
 * Build the host execution schema: the base manifest plus one input branch per capability.
 * `$id` is `ecp://host/execution.schema.json`.
 * @category Validation
 */
export function generateExecutionSchema(capabilities: readonly CapabilityEntry[]): JsonSchema {
  const schema = structuredClone(baseSchema) as JsonSchema
  schema.$id = "ecp://host/execution.schema.json"
  const defs = schema.$defs as JsonSchema
  const step = defs.step as JsonSchema
  const properties = step.properties as JsonSchema
  const ids = capabilities.map((capability) => capability.id)
  properties.uses = ids.length > 0 ? { type: "string", enum: ids } : { type: "string", enum: [] }
  step.allOf = capabilities.map((capability) => ({
    if: {
      type: "object",
      required: ["uses"],
      properties: { uses: { const: capability.id } },
    },
    then: {
      properties: { input: wrapValue(capability.accepts as JsonSchema) },
      "x-ecp-returns": capability.returns,
    },
  }))
  return schema
}

/**
 * Wrap a value schema so markers are accepted where the protocol allows them.
 * Used by the legacy combined host schema and by editor schema generation.
 * @category Validation
 */
export function wrapValue(schema: JsonSchema): JsonSchema {
  const original = wrapChildren(schema)
  // `$script` resolves to a string. Allow it on string fields and open schemas (`{}` /
  // `unknown`) that already accept any JSON value.
  const scriptBranch = allowsString(schema)
    ? { if: marker("$script"), then: SCRIPT_VALUE, else: original }
    : { if: marker("$script"), then: false, else: original }
  return {
    if: marker("$secret"),
    then: false,
    else: {
      if: marker("$env"),
      then: false,
      else: {
        if: marker("$ref"),
        then: REF_VALUE,
        else: {
          if: marker("$expr"),
          then: EXPR_VALUE,
          else: {
            if: marker("$state"),
            then: STATE_VALUE,
            else: scriptBranch,
          },
        },
      },
    },
  }
}

function wrapChildren(schema: JsonSchema): JsonSchema {
  const copy: JsonSchema = { ...schema }
  const properties = schema.properties
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    const wrapped: JsonSchema = {}
    for (const [key, child] of Object.entries(properties as Record<string, JsonSchema>)) {
      wrapped[key] = wrapValue(child ?? {})
    }
    copy.properties = wrapped
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    copy.items = wrapValue(schema.items as JsonSchema)
  }
  return copy
}

function marker(key: string): JsonSchema {
  return { type: "object", required: [key] }
}
