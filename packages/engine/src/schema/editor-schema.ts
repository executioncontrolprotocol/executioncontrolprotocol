import type { CapabilityEntry, PluginSchemaDocument } from "@executioncontrolprotocol/protocol"
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }
import { allowsString } from "../validate/markers.js"
import type { JsonSchema } from "./json-schema.js"

const REF_VALUE: JsonSchema = { $ref: "#/$defs/refValue" }
const STATE_VALUE: JsonSchema = { $ref: "#/$defs/stateValue" }
const SCRIPT_VALUE: JsonSchema = { $ref: "#/$defs/scriptValue" }

const EDITOR_SCHEMA_SUFFIX = ".editor.schema.json"

/**
 * Encode a plugin id as a basename that is safe both as a file name and inside a relative `$ref`
 * URL: only `[A-Za-z0-9.~-]` are kept, everything else (including `_`) becomes `_` plus two hex
 * digits (`@scope/name` → `_40scope_2fname`). Percent-encoding is not used because editors
 * URL-decode `$ref`s, turning `%2F` back into a path separator.
 * Reversible via {@link pluginIdFromSafeFileName}; collision-free for distinct ids.
 * @category Validation
 */
export function safePluginId(pluginId: string): string {
  return Array.from(new TextEncoder().encode(pluginId), (byte) => {
    const char = String.fromCharCode(byte)
    return /[A-Za-z0-9.~-]/.test(char) ? char : `_${byte.toString(16).padStart(2, "0")}`
  }).join("")
}

/**
 * Decode a {@link safePluginId} basename (with or without the `.editor.schema.json` suffix).
 * @category Validation
 */
export function pluginIdFromSafeFileName(fileName: string): string {
  const base = fileName.endsWith(EDITOR_SCHEMA_SUFFIX)
    ? fileName.slice(0, -EDITOR_SCHEMA_SUFFIX.length)
    : fileName
  const bytes: number[] = []
  for (let index = 0; index < base.length; index += 1) {
    if (base[index] === "_") {
      bytes.push(Number.parseInt(base.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(base.charCodeAt(index))
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
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
 * It has no `$id`, so relative `$ref`s resolve against the file's location on disk.
 * @category Validation
 */
export function generateEditorRootSchema(capabilities: readonly CapabilityEntry[]): JsonSchema {
  const schema = withEditorMessages(structuredClone(baseSchema) as JsonSchema)
  delete schema.$id
  const defs = schema.$defs as JsonSchema
  const step = defs.step as JsonSchema
  const properties = step.properties as JsonSchema
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]))
  const ids = [...byId.keys()].sort()
  // enumDescriptions is a VS Code JSON extension: shown in completion and hover for `uses`.
  properties.uses = {
    type: "string",
    enum: ids,
    enumDescriptions: ids.map((id) => byId.get(id)?.summary ?? ""),
    errorMessage:
      "Unknown capability id. Use completion here, or run `ecp retrieve --type capability` to list installed capabilities.",
  }
  const capabilityBound = capabilities.filter((capability) => capability.contract !== "step")
  step.allOf = capabilityBound.map((capability) => {
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
    if (accepts) defs[`${name}.editorInput`] = pointMarkersAtRoot(wrapValue(accepts as JsonSchema))
    if (returns) defs[`${name}.returns`] = returns
  }
  // No $id: editors and spec-following tools then resolve $refs against the file's real location.
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: defs,
  }
}

/** Marker definitions live in the root editor schema, one directory up from plugin files. */
const MARKER_REF = /^#\/\$defs\/(refValue|stateValue|scriptValue)$/

function pointMarkersAtRoot(schema: JsonSchema): JsonSchema {
  return JSON.parse(JSON.stringify(schema), (key, value: unknown) =>
    key === "$ref" && typeof value === "string" && MARKER_REF.test(value)
      ? `../execution.schema.json${value}`
      : value,
  ) as JsonSchema
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
    : { if: marker("$script"), then: rejectWith("$script resolves to a string; this field does not accept a string."), else: original }
  return {
    if: marker("$secret"),
    then: rejectWith(MARKER_REJECTIONS.$secret!),
    else: {
      if: marker("$env"),
      then: rejectWith(MARKER_REJECTIONS.$env!),
      else: {
        if: marker("$ref"),
        then: REF_VALUE,
        else: {
          if: marker("$expr"),
          then: rejectWith(INPUT_EXPR_REJECTION),
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

const INPUT_EXPR_REJECTION = "Use a transform step. Data edges are $ref only."

const MARKER_REJECTIONS: Record<string, string> = {
  $secret: "$secret is not allowed in an execution; put it in a config object and set the step's config field.",
  $env: "$env is not allowed in an execution; put it in a config object and set the step's config field.",
}

/** Replace the base schema's bare `false` for `$secret`/`$env` with a schema that carries a message. */
function withEditorMessages(schema: JsonSchema): JsonSchema {
  return JSON.parse(JSON.stringify(schema), function (this: Record<string, unknown>, key, value: unknown) {
    if (key !== "then" || value !== false) return value
    const required = (this.if as { required?: unknown } | undefined)?.required
    const markerKey = Array.isArray(required) && required.length === 1 ? String(required[0]) : ""
    return MARKER_REJECTIONS[markerKey] ? rejectWith(MARKER_REJECTIONS[markerKey]) : value
  }) as JsonSchema
}

/**
 * A schema nothing matches, with the message editors show instead of a generic one. An empty
 * `enum` fails every value, and VS Code reports an enum failure with the schema's `errorMessage`.
 */
function rejectWith(message: string): JsonSchema {
  return { enum: [], errorMessage: message }
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
