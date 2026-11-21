import { isJsonObject } from "./json-schema.js"

/**
 * JSON Schema fragment used as a portable port type hint.
 * @category App
 */
export type ValueSchemaHint = Record<string, unknown>

const FILE_REF_KINDS = ["file", "url", "artifact"] as const

/**
 * JSON Schema hint for a v2 file reference (`kind` `file`, `url` or `artifact`).
 * @category App
 */
export function fileRefValueSchemaHint(): ValueSchemaHint {
  return {
    "x-ecp-file": true,
    type: "object",
    properties: {
      kind: { type: "string", enum: [...FILE_REF_KINDS] },
      path: { type: "string" },
      uri: { type: "string" },
      url: { type: "string" },
      mediaType: { type: "string" },
      sizeBytes: { type: "number" },
      name: { type: "string" },
      headers: { type: "object" },
    },
  }
}

/**
 * Whether a JSON Schema hint describes a file ref port (`x-ecp-file`, `contentMediaType`,
 * binary format, or an object whose `kind` enum names a file ref kind).
 * @category App
 */
function xEcpFileAccess(schema: Record<string, unknown>): string | undefined {
  const raw = schema["x-ecp-file"]
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const access = (raw as Record<string, unknown>).access
    return typeof access === "string" ? access : undefined
  }
  return undefined
}

export function isFileValueSchemaHint(schema: Record<string, unknown>): boolean {
  if (schema["x-ecp-file"] === true) return true
  if (typeof schema["x-ecp-file"] === "object" && schema["x-ecp-file"] !== null) return true
  const media = schema.contentMediaType
  if (typeof media === "string" && media.length > 0) return true
  if (Array.isArray(media) && media.length > 0) return true
  if (schema.format === "binary" || schema.format === "byte") return true
  if (schema.type === "object" && isJsonObject(schema.properties)) {
    const kind = schema.properties.kind
    if (isJsonObject(kind) && Array.isArray(kind.enum)) {
      return kind.enum.some((value) => (FILE_REF_KINDS as readonly unknown[]).includes(value))
    }
  }
  return false
}

/**
 * Synthesize a minimal value schema from a type label (`string!`, `number`, `file`).
 * Returns `undefined` for unknown labels.
 * @category App
 */
export function valueSchemaFromEqlLabel(typeLabel: string): ValueSchemaHint | undefined {
  const base = typeLabel.replace(/!+$/, "").trim().toLowerCase()
  if (!base || base === "unknown") return undefined
  if (base === "string") return { type: "string" }
  if (base === "number" || base === "float") return { type: "number" }
  if (base === "int" || base === "integer") return { type: "integer" }
  if (base === "boolean" || base === "bool") return { type: "boolean" }
  if (base === "null") return { type: "null" }
  if (base === "array") return { type: "array" }
  if (base === "file") return fileRefValueSchemaHint()
  if (base === "object" || base === "record" || base === "json") return { type: "object" }
  return undefined
}

/**
 * Pass a JSON Schema property node through as a value schema hint (shallow clone).
 * @category App
 */
export function valueSchemaFromJsonSchemaProp(prop: unknown): ValueSchemaHint | undefined {
  if (!isJsonObject(prop)) return undefined
  return { ...prop }
}

/**
 * Build a name to value-schema map from a capability `accepts` / `returns` JSON Schema.
 * @category App
 */
export function valueSchemasFromCapabilitySchema(schema: unknown): Map<string, ValueSchemaHint> {
  const out = new Map<string, ValueSchemaHint>()
  if (!isJsonObject(schema)) return out
  const props = schema.properties
  if (!isJsonObject(props)) return out
  for (const [name, prop] of Object.entries(props)) {
    const hint = valueSchemaFromJsonSchemaProp(prop)
    if (hint) out.set(name, hint)
  }
  return out
}

/**
 * Display type label for a JSON Schema property: `file`, the schema `type`, or `unknown`,
 * with a trailing `!` when required.
 * @category App
 */
export function typeLabelFromSchema(
  schema: Record<string, unknown> | undefined,
  required: boolean,
): string {
  if (schema && isFileValueSchemaHint(schema)) {
    const access = xEcpFileAccess(schema)
    if (access === "url") return required ? "url!" : "url"
    return required ? "file!" : "file"
  }
  const type = schema?.type
  const base = typeof type === "string" ? type : Array.isArray(schema?.enum) ? "enum" : "unknown"
  return required ? `${base}!` : base
}
