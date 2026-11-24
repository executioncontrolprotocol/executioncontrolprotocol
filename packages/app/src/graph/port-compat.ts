import type { ReactFlowPort } from "./types.js"
import { isFileValueSchemaHint } from "./value-schema-hint.js"

/**
 * Normalized JSON Schema kinds used for drag-to-connect compatibility.
 * @category App
 */
export type PortTypeKind =
  | "unknown"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "array"
  | "object"
  | "enum"
  | "file"
  | "url"

const SCHEMA_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "array",
  "object",
])

function xEcpFileAccess(schema: Record<string, unknown>): string | undefined {
  const raw = schema["x-ecp-file"]
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const access = (raw as Record<string, unknown>).access
    return typeof access === "string" ? access : undefined
  }
  return undefined
}

function kindFromLabelBase(base: string): PortTypeKind {
  if (!base || base === "unknown" || base === "item") return "unknown"
  if (base === "string") return "string"
  if (base === "number" || base === "float") return "number"
  if (base === "int" || base === "integer") return "integer"
  if (base === "boolean" || base === "bool") return "boolean"
  if (base === "null") return "null"
  if (base === "array") return "array"
  if (base === "file") return "file"
  if (base === "url") return "url"
  if (base === "enum") return "enum"
  if (base === "object" || base === "record" || base === "json") return "object"
  return "unknown"
}

function kindFromSchema(schema: Record<string, unknown>): PortTypeKind | undefined {
  if (isFileValueSchemaHint(schema)) {
    return xEcpFileAccess(schema) === "url" ? "url" : "file"
  }
  const type = schema.type
  if (typeof type === "string" && SCHEMA_TYPES.has(type)) {
    return type as PortTypeKind
  }
  if (type === undefined && Array.isArray(schema.enum) && schema.enum.length > 0) return "enum"
  if (Array.isArray(type)) return "unknown"
  if (schema.oneOf !== undefined || schema.anyOf !== undefined) return "unknown"
  return undefined
}

/**
 * Classify a port for compatibility checks (schema first, then `typeLabel`).
 * @category App
 */
export function portTypeKind(port: ReactFlowPort): PortTypeKind {
  const schema = port.valueSchema
  if (schema && Object.keys(schema).length > 0) {
    const fromSchema = kindFromSchema(schema)
    if (fromSchema !== undefined) return fromSchema
  }
  const base = port.typeLabel.replace(/!+$/, "").trim().toLowerCase()
  return kindFromLabelBase(base)
}

/**
 * Whether an output port may connect to an input port.
 * @category App
 */
export function portsAreCompatible(source: ReactFlowPort, target: ReactFlowPort): boolean {
  const a = portTypeKind(source)
  const b = portTypeKind(target)
  if (a === "unknown" || b === "unknown") return true
  if (a === "file" && b === "url") return false
  if (a === "url" && b === "file") return true
  if (a === "integer" && b === "number") return true
  if (a === "number" && b === "integer") return false
  if (a === "string" && b === "enum") return true
  if (a === "enum" && b === "string") return true
  if (a === "enum" && b === "enum") return true
  return a === b
}

/**
 * First compatible port in schema order when wiring from a drag origin.
 * @category App
 */
export function firstMatchingPort(
  origin: ReactFlowPort,
  candidates: readonly ReactFlowPort[],
  originSide: "output" | "input",
): ReactFlowPort | undefined {
  for (const candidate of candidates) {
    if (originSide === "output") {
      if (portsAreCompatible(origin, candidate)) return candidate
    } else if (portsAreCompatible(candidate, origin)) return candidate
  }
  return undefined
}