/** EQL type map ↔ JSON Schema for workflow `accepts` / `returns`. @category Format */

import { fileRefValueSchemaHint } from "@executioncontrolprotocol/types"

const SUPPORTED_EQL_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "file",
  "unknown",
])

function isJsonSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isFileSchema(prop: Record<string, unknown>): boolean {
  if (prop["x-ecp-file"] === true) return true
  const props = prop.properties
  if (!isJsonSchemaObject(props)) return false
  const kind = props.kind
  if (isJsonSchemaObject(kind) && kind.const === "file") return true
  if (isJsonSchemaObject(kind) && Array.isArray(kind.enum)) {
    return kind.enum.includes("file")
  }
  return false
}

function filePropertyHint(sourceProp?: Record<string, unknown>): Record<string, unknown> {
  const contentMediaType = sourceProp?.contentMediaType
  if (typeof contentMediaType === "string" && contentMediaType.length > 0) {
    return fileRefValueSchemaHint({ contentMediaType })
  }
  if (Array.isArray(contentMediaType) && contentMediaType.length > 0) {
    return fileRefValueSchemaHint({
      contentMediaType: contentMediaType.filter((v): v is string => typeof v === "string"),
    })
  }
  return fileRefValueSchemaHint()
}

/**
 * Parse `name:type` from an EQL type declaration line (`WITH value:string!`).
 * @category Format
 */
export function parseTypeAnnotationSpec(
  spec: string
): { name: string; eqlType: string } | undefined {
  const colon = spec.indexOf(":")
  if (colon === -1) return undefined
  const name = spec.slice(0, colon).trim()
  const eqlType = spec.slice(colon + 1).trim()
  if (!name || !eqlType) return undefined
  return { name, eqlType }
}

/**
 * Convert an EQL type map to a JSON Schema object for workflow I/O.
 * When `sourceSchema` is provided, file properties copy `contentMediaType` hints from it.
 * @category Format
 */
export function eqlTypeMapToJsonSchema(
  typeMap: Record<string, string> | undefined,
  sourceSchema?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!typeMap || Object.keys(typeMap).length === 0) return undefined
  const sourceProps = isJsonSchemaObject(sourceSchema?.properties)
    ? (sourceSchema.properties as Record<string, unknown>)
    : undefined
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, eqlType] of Object.entries(typeMap)) {
    const isRequired = eqlType.endsWith("!")
    const base = isRequired ? eqlType.slice(0, -1) : eqlType
    if (isRequired) required.push(name)
    if (base === "file") {
      const sourceProp = isJsonSchemaObject(sourceProps?.[name])
        ? (sourceProps[name] as Record<string, unknown>)
        : undefined
      properties[name] = filePropertyHint(sourceProp)
    } else if (base === "unknown") {
      properties[name] = {}
    } else if (SUPPORTED_EQL_TYPES.has(base)) {
      properties[name] = { type: base }
    } else {
      properties[name] = { type: base }
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

/**
 * Convert workflow I/O JSON Schema to an EQL type map.
 * @category Format
 */
export function jsonSchemaToEqlTypeMap(
  schema: Record<string, unknown> | undefined
): Record<string, string> | undefined {
  if (!schema || !isJsonSchemaObject(schema)) return undefined
  const props = schema.properties
  if (!isJsonSchemaObject(props) || Object.keys(props).length === 0) return undefined
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : []
  )
  const out: Record<string, string> = {}
  for (const [name, prop] of Object.entries(props)) {
    if (!isJsonSchemaObject(prop)) {
      out[name] = required.has(name) ? "unknown!" : "unknown"
      continue
    }
    if (isFileSchema(prop)) {
      out[name] = required.has(name) ? "file!" : "file"
      continue
    }
    const typeName = typeof prop.type === "string" ? prop.type : "unknown"
    out[name] = required.has(name) ? `${typeName}!` : typeName
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * True when a workflow I/O schema is missing or has no properties.
 * @category Format
 */
export function isWorkflowIoSchemaAbsent(
  schema: Record<string, unknown> | undefined
): boolean {
  if (!schema) return true
  if (!isJsonSchemaObject(schema)) return true
  const props = schema.properties
  if (!isJsonSchemaObject(props)) return true
  return Object.keys(props).length === 0
}
