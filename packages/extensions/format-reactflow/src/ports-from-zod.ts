import type { Registry } from "@executioncontrolprotocol/core"
import { introspectCapabilitySchema } from "@executioncontrolprotocol/core"
import type { InputValue, StepNode } from "@executioncontrolprotocol/types"
import { parseStateRef } from "./extract-data-edges.js"
import type { ReactFlowPort } from "./types.js"
import {
  valueSchemaFromEqlLabel,
  valueSchemasFromCapabilitySchema,
  type ValueSchemaHint,
} from "./value-schema-hint.js"

const LITERAL_PREVIEW_MAX = 56

function typeLabelFor(
  eqlTypes: Record<string, string> | undefined,
  name: string,
  required: boolean
): string {
  const raw = eqlTypes?.[name]
  if (raw) return raw
  return required ? "unknown!" : "unknown"
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

/**
 * Compact string form of a literal input value (for previews / editors).
 * @category Encoding
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
 * @category Encoding
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

    if (isRefValue(value)) {
      const parsed = parseStateRef(value.$ref)
      port.binding = "ref"
      port.refPath = parsed
        ? parsed.fieldPath
          ? `${parsed.asKey}.${parsed.fieldPath}`
          : parsed.asKey
        : value.$ref.replace(/^state\./, "")
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
 * @category Encoding
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
 * Build input/output ports from capability Zod schemas, with input-key fallback
 * and literal / `$ref` binding metadata from `step.input`.
 * @category Encoding
 */
export function portsForStep(
  step: StepNode,
  registry: Registry | undefined
): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const cap = registry?.getCapability(String(step.uses))
  const inputFields = introspectCapabilitySchema(cap?.inputSchema)
  const outputFields = introspectCapabilitySchema(cap?.outputSchema)
  const inputSchemas = valueSchemasFromCapabilitySchema(cap?.inputSchema)
  const outputSchemas = valueSchemasFromCapabilitySchema(cap?.outputSchema)

  const inputs: ReactFlowPort[] = []
  const seenInputs = new Set<string>()

  for (const name of inputFields.required) {
    seenInputs.add(name)
    const typeLabel = typeLabelFor(inputFields.eqlTypes, name, true)
    const port: ReactFlowPort = {
      id: name,
      name,
      typeLabel,
      required: true,
    }
    attachValueSchema(port, inputSchemas, typeLabel)
    inputs.push(port)
  }
  for (const name of inputFields.optional) {
    seenInputs.add(name)
    const typeLabel = typeLabelFor(inputFields.eqlTypes, name, false)
    const port: ReactFlowPort = {
      id: name,
      name,
      typeLabel,
      required: false,
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
  for (const name of [...outputFields.required, ...outputFields.optional]) {
    const typeLabel = typeLabelFor(
      outputFields.eqlTypes,
      name,
      outputFields.required.includes(name)
    )
    const port: ReactFlowPort = {
      id: name,
      name,
      typeLabel,
    }
    attachValueSchema(port, outputSchemas, typeLabel)
    outputs.push(port)
  }

  if (outputs.length === 0 && step.as) {
    outputs.push({
      id: "output",
      name: "output",
      typeLabel: "unknown",
    })
  }

  return { inputs, outputs }
}
