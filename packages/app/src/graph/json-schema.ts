/**
 * One property of a JSON Schema object, with its resolved required flag.
 * @category App
 */
export interface JsonSchemaProperty {
  /** Property name. Dotted for nested paths from {@link flattenJsonSchemaProperties}. */
  name: string
  /** Property schema (`{}` when the schema is not an object). */
  schema: Record<string, unknown>
  /** True when listed in the parent's `required` (and every ancestor's, when flattened). */
  required: boolean
}

const PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean", "null"])
const MAX_FLATTEN_DEPTH = 8

/**
 * Whether a value is a plain JSON object (not null, not an array).
 * @category App
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * List the top-level properties of an object JSON Schema in declaration order.
 * @category App
 */
export function jsonSchemaObjectProperties(schema: unknown): JsonSchemaProperty[] {
  if (!isJsonObject(schema)) return []
  const props = schema.properties
  if (!isJsonObject(props)) return []
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  )
  return Object.entries(props).map(([name, prop]) => ({
    name,
    schema: isJsonObject(prop) ? prop : {},
    required: required.has(name),
  }))
}

function shouldRecurse(schema: Record<string, unknown>): boolean {
  if (schema.type === "array") return false
  if (schema["x-ecp-file"] === true) return false
  if (Array.isArray(schema.enum)) return false
  if (typeof schema.type === "string" && PRIMITIVE_TYPES.has(schema.type)) return false
  return isJsonObject(schema.properties)
}

function flattenInto(
  schema: unknown,
  prefix: string,
  parentRequired: boolean,
  depth: number,
  seen: Set<unknown>,
  out: JsonSchemaProperty[],
): void {
  if (depth > MAX_FLATTEN_DEPTH || seen.has(schema)) return
  seen.add(schema)
  for (const field of jsonSchemaObjectProperties(schema)) {
    const name = prefix ? `${prefix}.${field.name}` : field.name
    const required = parentRequired && field.required
    out.push({ name, schema: field.schema, required })
    if (shouldRecurse(field.schema)) {
      flattenInto(field.schema, name, required, depth + 1, seen, out)
    }
  }
}

/**
 * List bindable output paths: parent objects, nested primitives, and arrays as leaves.
 * Array items are not expanded (`items.0` is not a path).
 * @category App
 */
export function flattenJsonSchemaProperties(schema: unknown): JsonSchemaProperty[] {
  const out: JsonSchemaProperty[] = []
  flattenInto(schema, "", true, 0, new Set(), out)
  return out
}
