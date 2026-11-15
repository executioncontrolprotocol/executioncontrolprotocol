import { Flags, type Command } from "@oclif/core"
import { z } from "zod"
import { toKebabCase } from "./kebab.js"
import { RESERVED_FLAG_NAMES } from "./reserved-names.js"

/** oclif flag map generated from a zod object. @category CLI */
export type GeneratedFlagInput = Command.Class["flags"]

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema
  for (;;) {
    const def = current._def as { typeName?: string; innerType?: z.ZodTypeAny }
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = def.innerType ?? current
      continue
    }
    return current
  }
}

function isPrimitive(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodNativeEnum
  )
}

function descriptionOf(schema: z.ZodTypeAny, fallback: string): string {
  return schema.description ?? fallback
}

function enumValues(schema: z.ZodTypeAny): string[] | undefined {
  if (schema instanceof z.ZodEnum) {
    return [...schema.options.map(String)]
  }
  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema.enum as Record<string, string | number>)
    return values.filter((v): v is string => typeof v === "string")
  }
  return undefined
}

function shortChar(name: string): { char?: "o" } {
  return name === "output" ? { char: "o" } : {}
}

function flagForPrimitive(
  name: string,
  schema: z.ZodTypeAny,
  optional: boolean,
  defaultValue?: unknown
): GeneratedFlagInput[string] | undefined {
  const desc = descriptionOf(schema, name)
  if (schema instanceof z.ZodBoolean) {
    return Flags.boolean({
      description: desc,
      required: defaultValue === undefined && !optional,
      allowNo: defaultValue !== undefined,
      ...(defaultValue !== undefined ? { default: Boolean(defaultValue) } : {}),
    })
  }
  if (schema instanceof z.ZodNumber) {
    return Flags.integer({
      description: desc,
      required: !optional,
      ...shortChar(name),
    })
  }
  const options = enumValues(schema)
  if (schema instanceof z.ZodString || options) {
    return Flags.string({
      description: desc,
      required: !optional,
      ...shortChar(name),
      ...(options ? { options } : {}),
    })
  }
  return undefined
}

/**
 * Generate oclif flags from a zod object schema's top-level primitive fields.
 * Nested objects, unions and unknowns get no flag (they come from `--input`).
 * Reserved names (`json`, `input`, `help`, `yes`) stay input-only.
 * @category CLI
 */
export function flagsFromSchema(
  schema: z.ZodTypeAny | undefined,
  reserved: readonly string[] = RESERVED_FLAG_NAMES
): GeneratedFlagInput {
  if (!schema || !(schema instanceof z.ZodObject)) return {}
  const shape = schema.shape as Record<string, z.ZodTypeAny>
  const flags: GeneratedFlagInput = {}
  for (const [field, fieldSchema] of Object.entries(shape)) {
    const kebab = toKebabCase(field)
    if (reserved.includes(kebab)) continue
    const optional =
      fieldSchema instanceof z.ZodOptional ||
      fieldSchema instanceof z.ZodDefault ||
      fieldSchema.isOptional()
    const defaultValue =
      fieldSchema instanceof z.ZodDefault
        ? typeof fieldSchema._def.defaultValue === "function"
          ? fieldSchema._def.defaultValue()
          : fieldSchema._def.defaultValue
        : undefined
    const inner = unwrap(fieldSchema)
    if (inner instanceof z.ZodArray) {
      const element = unwrap(inner.element as z.ZodTypeAny)
      if (!isPrimitive(element) || element instanceof z.ZodBoolean) continue
      const primitive = flagForPrimitive(kebab, element, true)
      if (!primitive) continue
      flags[kebab] = Flags.string({
        description: descriptionOf(fieldSchema, kebab),
        multiple: true,
        required: !optional,
        options: "options" in primitive ? (primitive.options as string[] | undefined) : undefined,
      })
      continue
    }
    if (!isPrimitive(inner)) continue
    const flag = flagForPrimitive(kebab, inner, optional, defaultValue)
    if (flag) flags[kebab] = flag
  }
  return flags
}

/**
 * True when argv includes an explicit `--name` or `--name=` token.
 * @category CLI
 */
export function flagProvided(argv: string[], kebabName: string): boolean {
  const token = `--${kebabName}`
  if (argv.some((arg) => arg === token || arg.startsWith(`${token}=`))) return true
  if (kebabName === "output") {
    return argv.some((arg) => arg === "-o" || arg.startsWith("-o="))
  }
  return false
}
