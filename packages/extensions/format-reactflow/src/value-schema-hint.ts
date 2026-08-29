import { z } from "zod"
import {
  fileRefSchemaOptions,
  fileRefValueSchemaHint,
  isFileRefSchema,
} from "@executioncontrolprotocol/types"

/** JSON Schema fragment used as a portable port type hint. @category Encoding */
export type ValueSchemaHint = Record<string, unknown>

/**
 * Unwrap Zod wrappers that do not change the value shape for UI hints.
 * @category Encoding
 */
export function unwrapZodType(type: z.ZodType): z.ZodType {
  if (type instanceof z.ZodOptional) {
    return unwrapZodType(type.unwrap() as z.ZodType)
  }
  if (type instanceof z.ZodDefault) {
    return unwrapZodType(type.removeDefault() as z.ZodType)
  }
  if (type instanceof z.ZodNullable) {
    return unwrapZodType(type.unwrap() as z.ZodType)
  }
  return type
}

/**
 * Project a Zod type to a primitive-centered JSON Schema hint.
 * Enums stay `type: "string"` (or number) with an `enum` constraint — never a widget name.
 * @category Encoding
 */
export function valueSchemaFromZod(type: z.ZodType): ValueSchemaHint | undefined {
  const inner = unwrapZodType(type)

  if (isFileRefSchema(inner)) {
    return fileRefValueSchemaHint(fileRefSchemaOptions(type))
  }

  if (inner instanceof z.ZodString) {
    return { type: "string" }
  }
  if (inner instanceof z.ZodNumber) {
    return { type: "number" }
  }
  if (inner instanceof z.ZodBoolean) {
    return { type: "boolean" }
  }
  if (inner instanceof z.ZodNull) {
    return { type: "null" }
  }
  if (inner instanceof z.ZodEnum) {
    const values = inner.options as string[]
    return { type: "string", enum: [...values] }
  }
  if (inner instanceof z.ZodNativeEnum) {
    const raw = inner.enum as Record<string, string | number>
    const values = Object.values(raw).filter(
      (v) => typeof v === "string" || typeof v === "number"
    )
    const allNumber = values.every((v) => typeof v === "number")
    return {
      type: allNumber ? "number" : "string",
      enum: values,
    }
  }
  if (inner instanceof z.ZodLiteral) {
    const value = inner.value
    if (typeof value === "string") return { type: "string", enum: [value] }
    if (typeof value === "number") return { type: "number", enum: [value] }
    if (typeof value === "boolean") return { type: "boolean", enum: [value] }
    return undefined
  }
  if (inner instanceof z.ZodArray) {
    const items = valueSchemaFromZod(inner.element as z.ZodType)
    return items ? { type: "array", items } : { type: "array" }
  }
  if (inner instanceof z.ZodObject) {
    const properties: Record<string, ValueSchemaHint> = {}
    for (const [name, field] of Object.entries(inner.shape)) {
      const child = valueSchemaFromZod(field as z.ZodType)
      if (child) properties[name] = child
    }
    return Object.keys(properties).length > 0
      ? { type: "object", properties }
      : { type: "object" }
  }
  if (inner instanceof z.ZodRecord) {
    return { type: "object" }
  }
  if (inner instanceof z.ZodUnion || inner instanceof z.ZodDiscriminatedUnion) {
    const options = (inner.options as z.ZodType[])
      .map((opt) => valueSchemaFromZod(opt))
      .filter((s): s is ValueSchemaHint => Boolean(s))
    if (options.length === 0) return undefined
    if (options.length === 1) return options[0]
    return { oneOf: options }
  }
  if (inner instanceof z.ZodAny || inner instanceof z.ZodUnknown) {
    return {}
  }
  return undefined
}

/**
 * Synthesize a minimal valueSchema from an EQL-ish type label (`string!`, `number`, …).
 * @category Encoding
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
 * Pass through a JSON Schema property node as a valueSchema hint (shallow clone).
 * @category Encoding
 */
export function valueSchemaFromJsonSchemaProp(prop: unknown): ValueSchemaHint | undefined {
  if (prop === null || typeof prop !== "object" || Array.isArray(prop)) return undefined
  return { ...(prop as Record<string, unknown>) }
}

/**
 * Build a name → valueSchema map from a capability input/output schema.
 * Supports Zod objects and JSON Schema objects with `properties`.
 * @category Encoding
 */
export function valueSchemasFromCapabilitySchema(
  schema: unknown
): Map<string, ValueSchemaHint> {
  const out = new Map<string, ValueSchemaHint>()
  if (schema === null || schema === undefined) return out

  if (schema instanceof z.ZodObject) {
    for (const [name, field] of Object.entries(schema.shape)) {
      const hint = valueSchemaFromZod(field as z.ZodType)
      if (hint) out.set(name, hint)
    }
    return out
  }

  if (typeof schema === "object" && !Array.isArray(schema)) {
    const obj = schema as Record<string, unknown>
    const props = obj.properties
    if (props && typeof props === "object" && !Array.isArray(props)) {
      for (const [name, prop] of Object.entries(props as Record<string, unknown>)) {
        const hint = valueSchemaFromJsonSchemaProp(prop)
        if (hint) out.set(name, hint)
      }
    }
  }

  return out
}
