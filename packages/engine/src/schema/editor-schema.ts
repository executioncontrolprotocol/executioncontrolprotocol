import type { CapabilityEntry, PluginSchemaDocument } from "@executioncontrolprotocol/protocol"
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }
import { allowsString } from "../validate/markers.js"
import type { JsonSchema } from "./json-schema.js"

const REF_VALUE: JsonSchema = { $ref: "#/$defs/refValue" }
const EXPR_VALUE: JsonSchema = { $ref: "#/$defs/exprValue" }
const STATE_VALUE: JsonSchema = { $ref: "#/$defs/stateValue" }
const SCRIPT_VALUE: JsonSchema = { $ref: "#/$defs/scriptValue" }

const EDITOR_SCHEMA_SUFFIX = ".editor.schema.json"

/**
 * Encode a plugin id as a filesystem-safe basename (no `/` or bare `@` path segments).
 * Reversible via {@link pluginIdFromSafeFileName}; collision-free for distinct ids.
 * @category Validation
 */
export function safePluginId(pluginId: string): string {
  return encodeURIComponent(pluginId)
}

/**
 * Decode a {@link safePluginId} basename (with or without the `.editor.schema.json` suffix).
 * @category Validation
 */
export function pluginIdFromSafeFileName(fileName: string): string {
  const base = fileName.endsWith(EDITOR_SCHEMA_SUFFIX)
    ? fileName.slice(0, -EDITOR_SCHEMA_SUFFIX.length)
    : fileName
  return decodeURIComponent(base)
}

/**
 * Relative path from the root editor schema to a per-plugin editor schema file.
 * @category Validation
 */
export function pluginEditorSchemaRelativePath(pluginId: string): string {
  return `plugins/${safePluginId(pluginId)}${EDITOR_SCHEMA_SUFFIX}`
}

/**
 * Capability name segment used in `$defs` keys (`<name>.accepts` / `<name>.editorInput`).
 * @category Validation
 */
export function capabilityNameFromId(capabilityId: string): string {
  return capabilityId.includes(".") ? capabilityId.slice(capabilityId.lastIndexOf(".") + 1) : capabilityId
}

/**
 * Build the small root editor schema: base execution shape, `uses` completion, and relative
 * `$ref`s into per-plugin editor files. Runtime validation does not compile this schema.
 * `$id` is `ecp://host/execution.schema.json`.
 * @category Validation
 */
export function generateEditorRootSchema(capabilities: readonly CapabilityEntry[]): JsonSchema {
  const schema = structuredClone(baseSchema) as JsonSchema
  schema.$id = "ecp://host/execution.schema.json"
  const defs = schema.$defs as JsonSchema
  const step = defs.step as JsonSchema
  const properties = step.properties as JsonSchema
  const ids = [...new Set(capabilities.map((capability) => capability.id))].sort()
  properties.uses = ids.length > 0 ? { type: "string", enum: ids } : { type: "string", enum: [] }
  step.allOf = capabilities.map((capability) => {
    const name = capabilityNameFromId(capability.id)
    const relative = pluginEditorSchemaRelativePath(capability.plugin)
    return {
      if: {
        type: "object",
        required: ["uses"],
        properties: { uses: { const: capability.id } },
      },
      then: {
        properties: {
          input: { $ref: `${relative}#/$defs/${name}.editorInput` },
        },
        "x-ecp-returns": { $ref: `${relative}#/$defs/${name}.returns` },
      },
    }
  })
  return schema
}

/**
 * Build a per-plugin editor schema document with marker-wrapped `editorInput` defs.
 * @category Validation
 */
export function generatePluginEditorSchema(
  pluginId: string,
  capabilities: readonly CapabilityEntry[],
  document: PluginSchemaDocument,
): JsonSchema {
  const defs: JsonSchema = {}
  for (const capability of capabilities) {
    if (capability.plugin !== pluginId) continue
    const name = capabilityNameFromId(capability.id)
    const accepts = document.$defs[`${name}.accepts`]
    const returns = document.$defs[`${name}.returns`]
    if (accepts) defs[`${name}.editorInput`] = wrapValue(accepts as JsonSchema)
    if (returns) defs[`${name}.returns`] = returns
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `ecp://host/schema/${pluginEditorSchemaRelativePath(pluginId)}`,
    $defs: defs,
  }
}

/**
 * Wrap a value schema so markers are accepted where the protocol allows them.
 * Editor schema generation only; runtime validation uses raw accepts + marker filtering.
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
