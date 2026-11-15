import { isJsonObject, jsonSchemaObjectProperties } from "../graph/json-schema.js"

/**
 * Control kind for one run input field. `json` is a JSON textarea (objects, arrays and
 * anything without a simpler control).
 * @category App
 */
export type RunInputFieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "json"

/**
 * One field of the run input form, generated from a property of `execution.accepts`.
 * @category App
 */
export interface RunInputField {
  /** Property name (the run input key). */
  name: string
  /** Display label: the schema `title`, else the name. */
  label: string
  /** Control kind. */
  kind: RunInputFieldKind
  /** True when listed in `accepts.required`. */
  required: boolean
  /** Schema `description`, when present. */
  description?: string
  /** Allowed values, when `kind` is `enum`. */
  enumValues?: unknown[]
  /** Schema `default`, when present. */
  defaultValue?: unknown
  /** Expected JSON type for `json` fields (`object` / `array`), when the schema says. */
  jsonType?: "object" | "array"
  /** The property schema. */
  schema: Record<string, unknown>
}

/**
 * Result of parsing one field draft.
 * @category App
 */
export type RunInputParseResult =
  | { ok: true; value: unknown }
  | { ok: true; omit: true }
  | { ok: false; error: string }

/**
 * Result of collecting the whole form.
 * @category App
 */
export type RunInputCollectResult =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> }

const REQUIRED_MESSAGE = "Required."

function primaryType(schema: Record<string, unknown>): string | undefined {
  const type = schema.type
  if (typeof type === "string") return type
  if (Array.isArray(type)) {
    return type.find((t): t is string => typeof t === "string" && t !== "null")
  }
  return undefined
}

function fieldKind(schema: Record<string, unknown>): RunInputFieldKind {
  if (Array.isArray(schema.enum) || "const" in schema) return "enum"
  const type = primaryType(schema)
  if (type === "string" || type === "number" || type === "integer" || type === "boolean") return type
  return "json"
}

/**
 * Generate run input form fields from an `execution.accepts` JSON Schema, in property
 * order. Returns an empty list when the schema has no properties.
 * @category App
 */
export function runInputFields(accepts: unknown): RunInputField[] {
  return jsonSchemaObjectProperties(accepts).map((property) => {
    const schema = property.schema
    const kind = fieldKind(schema)
    const type = primaryType(schema)
    const field: RunInputField = {
      name: property.name,
      label: typeof schema.title === "string" && schema.title ? schema.title : property.name,
      kind,
      required: property.required,
      schema,
    }
    if (typeof schema.description === "string") field.description = schema.description
    if ("default" in schema) field.defaultValue = schema.default
    if (kind === "enum") {
      field.enumValues = Array.isArray(schema.enum) ? [...schema.enum] : [schema.const]
    }
    if (kind === "json" && (type === "object" || type === "array")) field.jsonType = type
    return field
  })
}

/**
 * Initial text draft for a field: its `default` when set, else empty (`false` for a
 * required boolean). Enum drafts are JSON-encoded so non-string options round-trip.
 * @category App
 */
export function initialRunInputDraft(field: RunInputField): string {
  const value = field.defaultValue
  if (value === undefined) return field.kind === "boolean" && field.required ? "false" : ""
  if (field.kind === "enum") return enumOptionDraft(value)
  if (field.kind === "json") return JSON.stringify(value, null, 2)
  return String(value)
}

/**
 * Encode an enum option as the draft value used by {@link parseRunInputDraft}.
 * @category App
 */
export function enumOptionDraft(option: unknown): string {
  return JSON.stringify(option)
}

function parseJson(draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(draft) as unknown }
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Parse one field draft into a run input value. An empty draft omits an optional field
 * and fails a required one.
 * @category App
 */
export function parseRunInputDraft(field: RunInputField, draft: string): RunInputParseResult {
  const text = field.kind === "string" ? draft : draft.trim()
  if (text === "") return field.required ? { ok: false, error: REQUIRED_MESSAGE } : { ok: true, omit: true }

  switch (field.kind) {
    case "string":
      return { ok: true, value: text }
    case "number":
    case "integer": {
      const value = Number(text)
      if (!Number.isFinite(value)) return { ok: false, error: "Enter a number." }
      if (field.kind === "integer" && !Number.isInteger(value)) {
        return { ok: false, error: "Enter a whole number." }
      }
      return { ok: true, value }
    }
    case "boolean":
      if (text === "true") return { ok: true, value: true }
      if (text === "false") return { ok: true, value: false }
      return { ok: false, error: "Choose true or false." }
    case "enum": {
      const options = field.enumValues ?? []
      const index = options.findIndex((option) => enumOptionDraft(option) === text)
      if (index === -1) return { ok: false, error: "Choose one of the listed values." }
      return { ok: true, value: options[index] }
    }
    default: {
      const parsed = parseJson(text)
      if (!parsed.ok) return parsed
      if (field.jsonType === "object" && !isJsonObject(parsed.value)) {
        return { ok: false, error: "Enter a JSON object." }
      }
      if (field.jsonType === "array" && !Array.isArray(parsed.value)) {
        return { ok: false, error: "Enter a JSON array." }
      }
      return { ok: true, value: parsed.value }
    }
  }
}

/**
 * Parse every field draft into a run input object, or return per-field errors.
 * Missing drafts count as empty.
 * @category App
 */
export function collectRunInput(
  fields: readonly RunInputField[],
  drafts: Readonly<Record<string, string>>,
): RunInputCollectResult {
  const input: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const result = parseRunInputDraft(field, drafts[field.name] ?? "")
    if (!result.ok) {
      errors[field.name] = result.error
    } else if ("value" in result) {
      input[field.name] = result.value
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, input }
}
