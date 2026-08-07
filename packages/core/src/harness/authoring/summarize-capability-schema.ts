import { z } from "zod"

/** Classified capability schema fields for harness prompts. @category Harness */
export interface CapabilitySchemaFields {
  /** Required input field names. */
  required: string[]
  /** Optional input field names. */
  optional: string[]
  /** EQL type map projection when schema is introspectable. */
  eqlTypes?: Record<string, string>
}

function isEqlTypeMap(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "string")
}

function parseEqlTypeMap(types: Record<string, string>): CapabilitySchemaFields {
  const required: string[] = []
  const optional: string[] = []
  for (const [name, type] of Object.entries(types)) {
    if (type.endsWith("!")) {
      required.push(name)
    } else {
      optional.push(name)
    }
  }
  return { required, optional, eqlTypes: types }
}

function zodTypeToEql(typeName: z.ZodType, required: boolean): string {
  const base = (() => {
    if (typeName instanceof z.ZodString) return "string"
    if (typeName instanceof z.ZodNumber) return "number"
    if (typeName instanceof z.ZodBoolean) return "boolean"
    if (typeName instanceof z.ZodArray) return "array"
    if (typeName instanceof z.ZodObject) return "object"
    if (typeName instanceof z.ZodEnum) return "string"
    if (typeName instanceof z.ZodRecord) return "object"
    if (typeName instanceof z.ZodUnknown) return "unknown"
    if (typeName instanceof z.ZodAny) return "unknown"
    return "unknown"
  })()
  return required ? `${base}!` : base
}

function innerZodType(type: z.ZodType): z.ZodType {
  if (type instanceof z.ZodOptional) {
    return innerZodType(type.unwrap() as z.ZodType)
  }
  if (type instanceof z.ZodDefault) {
    return innerZodType(type.removeDefault() as z.ZodType)
  }
  if (type instanceof z.ZodNullable) {
    return innerZodType(type.unwrap() as z.ZodType)
  }
  return type
}

function parseZodObjectSchema(schema: z.ZodObject<z.ZodRawShape>): CapabilitySchemaFields {
  const required: string[] = []
  const optional: string[] = []
  const eqlTypes: Record<string, string> = {}
  for (const [name, fieldSchema] of Object.entries(schema.shape)) {
    const field = fieldSchema as z.ZodType
    const isOptional = field.isOptional()
    if (isOptional) {
      optional.push(name)
    } else {
      required.push(name)
    }
    eqlTypes[name] = zodTypeToEql(innerZodType(field), !isOptional)
  }
  return { required, optional, eqlTypes }
}

function parseJsonSchema(schema: Record<string, unknown>): CapabilitySchemaFields {
  const props = schema.properties
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return { required: [], optional: [] }
  }
  const requiredSet = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : []
  )
  const required: string[] = []
  const optional: string[] = []
  const eqlTypes: Record<string, string> = {}
  for (const name of Object.keys(props as Record<string, unknown>)) {
    const prop = (props as Record<string, unknown>)[name]
    const typeName =
      prop !== null && typeof prop === "object" && "type" in prop
        ? String((prop as { type?: unknown }).type ?? "unknown")
        : "unknown"
    const isRequired = requiredSet.has(name)
    if (isRequired) {
      required.push(name)
      eqlTypes[name] = `${typeName}!`
    } else {
      optional.push(name)
      eqlTypes[name] = typeName
    }
  }
  return { required, optional, eqlTypes }
}

/**
 * Introspect a capability input/output schema into required and optional field names.
 * Supports Zod object schemas, JSON Schema objects, and EQL type maps.
 * @category Harness
 */
export function introspectCapabilitySchema(schema: unknown): CapabilitySchemaFields {
  if (schema === null || schema === undefined) {
    return { required: [], optional: [] }
  }

  if (schema instanceof z.ZodObject) {
    return parseZodObjectSchema(schema)
  }

  if (isEqlTypeMap(schema)) {
    return parseEqlTypeMap(schema)
  }

  if (typeof schema === "object" && !Array.isArray(schema)) {
    const obj = schema as Record<string, unknown>
    if (obj.properties && typeof obj.properties === "object") {
      return parseJsonSchema(obj)
    }
  }

  return { required: [], optional: [] }
}

/** Format input field names with required/optional labels for harness prompts. @category Harness */
export function formatCapabilityInputLabels(fields: CapabilitySchemaFields): string {
  const parts = [
    ...fields.required.map((name) => `${name} (required)`),
    ...fields.optional.map((name) => `${name} (optional)`),
  ]
  return parts.join(", ")
}

/** All input field names (required first, then optional). @category Harness */
export function allCapabilityInputNames(fields: CapabilitySchemaFields): string[] {
  return [...fields.required, ...fields.optional]
}
