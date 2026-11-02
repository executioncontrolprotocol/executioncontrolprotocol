import type { Registry } from "@executioncontrolprotocol/core"
import {
  flattenJsonSchemaProperties,
  isZodType,
  jsonSchemaFromZod,
  jsonSchemaObjectProperties,
} from "@executioncontrolprotocol/core"
import type { InputValue, StepNode } from "@executioncontrolprotocol/core/types"
import { parseStateRef } from "./extract-data-edges.js"
import type { CapabilityIoSchemas, ReactFlowPort } from "./types.js"
import {
  isFileValueSchemaHint,
  valueSchemaFromEqlLabel,
  valueSchemasFromCapabilitySchema,
  type ValueSchemaHint,
} from "./value-schema-hint.js"

const LITERAL_PREVIEW_MAX = 56

/** Whole-document output handle (`ref("as")` with no field path). */
const OUTPUT_HANDLE_ID = "output"

function typeLabelFromHint(
  schema: Record<string, unknown> | undefined,
  required: boolean
): string {
  if (schema && isFileValueSchemaHint(schema)) {
    return required ? "file!" : "file"
  }
  const t = schema?.type
  const base = typeof t === "string" ? t : "unknown"
  return required ? `${base}!` : base
}

function attachValueSchema(
  port: ReactFlowPort,
  schemas: Map<string, ValueSchemaHint>,
  typeLabel: string
): void {
  const fromCap = schemas.get(port.name)
  if (fromCap) {
    port.valueSchema = fromCap
    return
  }
  const fromLabel = valueSchemaFromEqlLabel(typeLabel)
  if (fromLabel) port.valueSchema = fromLabel
}

function isRefValue(value: InputValue): value is { $ref: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as { $ref: unknown }).$ref === "string"
  )
}

function isStateValue(value: InputValue): value is { $state: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$state" in value &&
    typeof (value as { $state: unknown }).$state === "string"
  )
}

function refPathFromInputValue(value: InputValue): string | undefined {
  if (isRefValue(value)) return value.$ref
  if (isStateValue(value)) return value.$state
  return undefined
}

/**
 * Compact string form of a literal input value (for previews / editors).
 * @category App
 */
export function formatLiteralValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Truncate a literal for port row display.
 * @category App
 */
export function truncateLiteralPreview(full: string, max = LITERAL_PREVIEW_MAX): string {
  if (full.length <= max) return full
  return `${full.slice(0, Math.max(0, max - 1))}…`
}

function applyInputBindings(inputs: ReactFlowPort[], step: StepNode): void {
  if (!step.input) return
  const byName = new Map(inputs.map((p) => [p.name, p]))

  for (const [name, value] of Object.entries(step.input)) {
    let port = byName.get(name)
    if (!port) {
      port = { id: name, name, typeLabel: "unknown", required: false }
      inputs.push(port)
      byName.set(name, port)
    }

    if (isRefValue(value) || isStateValue(value)) {
      const rawRef = refPathFromInputValue(value)
      if (!rawRef) continue
      const parsed = parseStateRef(rawRef)
      port.binding = "ref"
      port.refPath = parsed
        ? parsed.fieldPath
          ? `${parsed.asKey}.${parsed.fieldPath}`
          : parsed.asKey
        : rawRef.replace(/^state\./, "")
      delete port.valuePreview
      delete port.valueTitle
      continue
    }

    const full = formatLiteralValue(value)
    port.binding = "literal"
    port.valueTitle = full
    port.valuePreview = truncateLiteralPreview(full)
    delete port.refPath
  }
}

/**
 * Ensure an output port exists for a data-edge source handle.
 * @category App
 */
export function ensureOutputPort(outputs: ReactFlowPort[], handleId: string): void {
  if (outputs.some((p) => p.id === handleId)) return
  outputs.push({
    id: handleId,
    name: handleId,
    typeLabel: "unknown",
  })
}

/**
 * Project a Zod type or JSON Schema object to a JSON Schema record.
 * @category App
 */
export function toJsonObjectSchema(schema: unknown): Record<string, unknown> | undefined {
  if (schema === undefined || schema === null) return undefined
  if (isZodType(schema)) return jsonSchemaFromZod(schema)
  if (typeof schema === "object" && !Array.isArray(schema)) {
    return schema as Record<string, unknown>
  }
  return undefined
}

/**
 * Build input/output ports from capability Zod schemas, with input-key fallback
 * and literal / `$ref` binding metadata from `step.input`.
 * When `registry` has no capability, {@link CapabilityIoSchemas} from `describe()`
 * supplies the same JSON Schema ports.
 * @category App
 */
export function portsForStep(
  step: StepNode,
  registry: Registry | undefined,
  schemas?: CapabilityIoSchemas
): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const cap = registry?.getCapability(String(step.uses))
  const inputSource = cap?.inputSchema ?? schemas?.inputSchema
  const outputSource = cap?.outputSchema ?? schemas?.outputSchema
  const inputJson = toJsonObjectSchema(inputSource)
  const outputJson = toJsonObjectSchema(outputSource)
  const inputFields = jsonSchemaObjectProperties(inputJson)
  const outputFields = flattenJsonSchemaProperties(outputJson)
  const inputSchemas = valueSchemasFromCapabilitySchema(inputSource)

  const inputs: ReactFlowPort[] = []
  const seenInputs = new Set<string>()

  for (const field of inputFields) {
    seenInputs.add(field.name)
    const typeLabel = typeLabelFromHint(field.schema, field.required)
    const port: ReactFlowPort = {
      id: field.name,
      name: field.name,
      typeLabel,
      required: field.required,
    }
    attachValueSchema(port, inputSchemas, typeLabel)
    inputs.push(port)
  }

  if (step.input) {
    for (const name of Object.keys(step.input)) {
      if (seenInputs.has(name)) continue
      const port: ReactFlowPort = {
        id: name,
        name,
        typeLabel: "unknown",
        required: false,
      }
      attachValueSchema(port, inputSchemas, "unknown")
      inputs.push(port)
    }
  }

  applyInputBindings(inputs, step)

  const outputs: ReactFlowPort[] = []
  const seenOutputs = new Set<string>()
  if (!outputFields.some((field) => field.name === OUTPUT_HANDLE_ID)) {
    const whole: ReactFlowPort = {
      id: OUTPUT_HANDLE_ID,
      name: OUTPUT_HANDLE_ID,
      typeLabel: "object",
      valueSchema: { type: "object" },
    }
    outputs.push(whole)
    seenOutputs.add(OUTPUT_HANDLE_ID)
  }
  for (const field of outputFields) {
    if (seenOutputs.has(field.name)) continue
    seenOutputs.add(field.name)
    const typeLabel = typeLabelFromHint(field.schema, field.required)
    const port: ReactFlowPort = {
      id: field.name,
      name: field.name,
      typeLabel,
      valueSchema: field.schema,
    }
    outputs.push(port)
  }

  return { inputs, outputs }
}
