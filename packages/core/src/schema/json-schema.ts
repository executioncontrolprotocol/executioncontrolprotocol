import { z } from "zod"
import {
  fileRefSchemaOptions,
  fileRefValueSchemaHint,
  isFileRefSchema,
} from "@executioncontrolprotocol/types"

function unwrapZodType(type: z.ZodType): z.ZodType {
  if (type instanceof z.ZodOptional) return unwrapZodType(type.unwrap() as z.ZodType)
  if (type instanceof z.ZodDefault) return unwrapZodType(type.removeDefault() as z.ZodType)
  if (type instanceof z.ZodNullable) return unwrapZodType(type.unwrap() as z.ZodType)
  if (type instanceof z.ZodEffects) return unwrapZodType(type._def.schema as z.ZodType)
  return type
}

function isOptionalField(type: z.ZodType): boolean {
  return type instanceof z.ZodOptional || type instanceof z.ZodDefault
}

function zodDescription(type: z.ZodType): string | undefined {
  const desc = (type as z.ZodType & { description?: string }).description
  return typeof desc === "string" && desc.trim() ? desc : undefined
}

function applyZodStringChecks(
  schema: Record<string, unknown>,
  type: z.ZodString
): Record<string, unknown> {
  const checks = (type._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
  for (const check of checks) {
    if (check.kind === "min" && typeof check.value === "number") schema.minLength = check.value
    if (check.kind === "max" && typeof check.value === "number") schema.maxLength = check.value
  }
  return schema
}

function applyZodNumberChecks(
  schema: Record<string, unknown>,
  type: z.ZodNumber
): Record<string, unknown> {
  const checks = (type._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
  for (const check of checks) {
    if (check.kind === "min" && typeof check.value === "number") schema.minimum = check.value
    if (check.kind === "max" && typeof check.value === "number") schema.maximum = check.value
    if (check.kind === "int") schema.type = "integer"
  }
  return schema
}

/**
 * Project a Zod type to a JSON Schema fragment (primitives + object/array).
 * Includes common constraints (min/max length, min/max number, int) and field descriptions.
 * @category Schema
 */
export function jsonSchemaFromZod(type: z.ZodType): Record<string, unknown> {
  const description = zodDescription(type)
  const inner = unwrapZodType(type)

  let schema: Record<string, unknown>
  if (inner instanceof z.ZodString) {
    schema = applyZodStringChecks({ type: "string" }, inner)
  } else if (inner instanceof z.ZodNumber) {
    schema = applyZodNumberChecks({ type: "number" }, inner)
  } else if (inner instanceof z.ZodBoolean) {
    schema = { type: "boolean" }
  } else if (inner instanceof z.ZodNull) {
    schema = { type: "null" }
  } else if (inner instanceof z.ZodEnum) {
    schema = { type: "string", enum: [...(inner.options as string[])] }
  } else if (inner instanceof z.ZodLiteral) {
    const value = inner.value
    if (typeof value === "string") schema = { type: "string", enum: [value] }
    else if (typeof value === "number") schema = { type: "number", enum: [value] }
    else if (typeof value === "boolean") schema = { type: "boolean", enum: [value] }
    else schema = {}
  } else if (inner instanceof z.ZodArray) {
    schema = { type: "array", items: jsonSchemaFromZod(inner.element as z.ZodType) }
  } else if (inner instanceof z.ZodObject) {
    const properties: Record<string, Record<string, unknown>> = {}
    const required: string[] = []
    for (const [name, field] of Object.entries(inner.shape)) {
      const fieldType = field as z.ZodType
      properties[name] = jsonSchemaFromZod(fieldType)
      if (!isOptionalField(fieldType)) required.push(name)
    }
    schema = { type: "object", properties }
    if (required.length > 0) schema.required = required
  } else if (inner instanceof z.ZodRecord) {
    schema = { type: "object" }
  } else if (inner instanceof z.ZodAny || inner instanceof z.ZodUnknown) {
    schema = {}
  } else if (isFileRefSchema(inner)) {
    schema = fileRefValueSchemaHint(fileRefSchemaOptions(inner))
  } else {
    schema = {}
  }

  if (description) schema.description = description
  return schema
}

function isJsonSchemaObject(schema: unknown): schema is Record<string, unknown> {
  return schema !== null && typeof schema === "object" && !Array.isArray(schema)
}

/**
 * List object-schema properties for workflow `accepts` / `returns`.
 * @category Schema
 */
export function jsonSchemaObjectProperties(
  schema: Record<string, unknown> | undefined
): Array<{ name: string; schema: Record<string, unknown>; required: boolean }> {
  if (!schema) return []
  const props = schema.properties
  if (!isJsonSchemaObject(props)) return []
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : []
  )
  const out: Array<{ name: string; schema: Record<string, unknown>; required: boolean }> = []
  for (const [name, prop] of Object.entries(props)) {
    out.push({
      name,
      schema: isJsonSchemaObject(prop) ? prop : {},
      required: required.has(name),
    })
  }
  return out
}

function jsonSchemaTypeLabel(schema: Record<string, unknown>): string {
  const t = schema.type
  return typeof t === "string" ? t : "unknown"
}

function typeMatches(schema: Record<string, unknown>, value: unknown): boolean {
  const t = schema.type
  if (t === undefined) return true
  if (t === "string") return typeof value === "string"
  if (t === "number") return typeof value === "number" && Number.isFinite(value)
  if (t === "integer") return typeof value === "number" && Number.isInteger(value)
  if (t === "boolean") return typeof value === "boolean"
  if (t === "null") return value === null
  if (t === "array") return Array.isArray(value)
  if (t === "object") return value !== null && typeof value === "object" && !Array.isArray(value)
  return true
}

/**
 * Validate a value against a subset of JSON Schema (object properties, required, types).
 * @category Schema
 */
export function validateAgainstJsonSchema(
  schema: Record<string, unknown> | undefined,
  value: unknown
): { ok: true } | { ok: false; errors: string[] } {
  if (!schema || Object.keys(schema).length === 0) return { ok: true }
  const errors: string[] = []
  const fields = jsonSchemaObjectProperties(schema)
  if (fields.length === 0 && schema.type !== "object") {
    if (value !== undefined && !typeMatches(schema, value)) {
      return { ok: false, errors: [`Expected type ${jsonSchemaTypeLabel(schema)}`] }
    }
    return { ok: true }
  }

  const obj =
    value === undefined || value === null
      ? {}
      : typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
  if (obj === null) {
    return { ok: false, errors: ["Expected an object"] }
  }

  for (const field of fields) {
    if (!(field.name in obj)) {
      if (field.required) errors.push(`Missing required property: ${field.name}`)
      continue
    }
    if (!typeMatches(field.schema, obj[field.name])) {
      errors.push(`Property '${field.name}' expected type ${jsonSchemaTypeLabel(field.schema)}`)
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}

/**
 * Walk a dot-separated path against run state (e.g. `inspected.metadata`).
 * @category Schema
 */
export function resolveStatePath(
  state: Record<string, unknown>,
  dotPath: string
): unknown {
  const segments = dotPath.split(".").filter((segment) => segment.length > 0)
  if (segments.length === 0) return undefined
  let current: unknown = state
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined
    }
    if (!(segment in current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Pick state values listed in a `returns` object schema.
 * Property names may be dot paths (e.g. `inspected.metadata`).
 * @category Schema
 */
export function pickWorkflowReturns(
  schema: Record<string, unknown> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> | undefined {
  const fields = jsonSchemaObjectProperties(schema)
  if (fields.length === 0) return undefined
  const output: Record<string, unknown> = {}
  for (const field of fields) {
    const value = resolveStatePath(state, field.name)
    if (value !== undefined) output[field.name] = value
  }
  return output
}

/**
 * Render a JSON Schema fragment as a Fluent `.accepts()` / `.returns()` argument.
 * Pretty-prints object schemas across multiple lines; use `compact` for a single line.
 * @category Schema
 */
export function renderJsonSchemaAsFluentArg(
  schema: Record<string, unknown>,
  options?: { compact?: boolean }
): string {
  if (options?.compact) return JSON.stringify(schema)
  const pretty = JSON.stringify(schema, null, 2)
  if (!pretty.includes("\n")) return pretty
  return pretty
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n")
}

/** True when a value looks like a Zod schema instance. @category Schema */
export function isZodType(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType
}
