import type { CapabilityDefinition } from "../definitions/types.js"
import type { Registry } from "../registry/registry.js"
import { isZodType, jsonSchemaFromZod } from "../schema/json-schema.js"
import {
  ECP_INPUT_INVALID,
  type InputValue,
  type ValidationIssue,
  type ValidationResult,
  type WorkflowManifest,
  type WorkflowNode,
} from "../types/index.js"

function isPlaceholderInput(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("$ref" in value || "$state" in value || "$env" in value || "$secret" in value)
  )
}

function jsonSchemaTypeOf(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function matchesJsonSchemaType(value: unknown, schemaType: unknown): boolean {
  if (typeof schemaType !== "string") return true
  if (schemaType === "integer") {
    return typeof value === "number" && Number.isInteger(value)
  }
  if (schemaType === "number") return typeof value === "number"
  if (schemaType === "string") return typeof value === "string"
  if (schemaType === "boolean") return typeof value === "boolean"
  if (schemaType === "null") return value === null
  if (schemaType === "array") return Array.isArray(value)
  if (schemaType === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }
  return true
}

function issue(
  message: string,
  path: string
): ValidationIssue {
  return {
    code: ECP_INPUT_INVALID,
    message,
    path,
    severity: "error",
  }
}

/**
 * Validate a step's literal input against a projected JSON Schema.
 * Skips `$ref` / `$state` / `$env` / `$secret` values. Unknown object keys
 * and missing required keys are errors (Zod would strip unknown keys).
 * @category Validation
 */
export function validateStepInputAgainstSchema(
  input: Record<string, InputValue> | undefined,
  schema: Record<string, unknown> | undefined,
  stepId: string
): ValidationIssue[] {
  if (!schema) return []
  const props = schema.properties
  if (props === null || typeof props !== "object" || Array.isArray(props)) return []

  const allowed = new Set(Object.keys(props as Record<string, unknown>))
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === "string")
      : []
  )
  const values = input ?? {}
  const errors: ValidationIssue[] = []

  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      errors.push(
        issue(
          `Unknown input key "${key}"`,
          `steps.${stepId}.input.${key}`
        )
      )
      continue
    }
    const value = values[key]
    if (isPlaceholderInput(value)) continue
    const fieldSchema = (props as Record<string, unknown>)[key]
    if (fieldSchema === null || typeof fieldSchema !== "object" || Array.isArray(fieldSchema)) {
      continue
    }
    const field = fieldSchema as Record<string, unknown>
    if (!matchesJsonSchemaType(value, field.type)) {
      errors.push(
        issue(
          `Input "${key}" expected ${String(field.type)}, got ${jsonSchemaTypeOf(value)}`,
          `steps.${stepId}.input.${key}`
        )
      )
    }
  }

  for (const key of required) {
    if (!(key in values)) {
      errors.push(
        issue(`Missing required input "${key}"`, `steps.${stepId}.input.${key}`)
      )
    }
  }

  return errors
}

function capabilityInputSchema(
  cap: CapabilityDefinition | undefined
): Record<string, unknown> | undefined {
  if (!cap?.inputSchema) return undefined
  if (isZodType(cap.inputSchema)) return jsonSchemaFromZod(cap.inputSchema)
  if (
    cap.inputSchema !== null &&
    typeof cap.inputSchema === "object" &&
    !Array.isArray(cap.inputSchema)
  ) {
    return cap.inputSchema as Record<string, unknown>
  }
  return undefined
}

function validateNodeInputs(
  node: WorkflowNode,
  registry: Registry,
  result: ValidationResult
): void {
  if (!node.type || node.type === "step") {
    const step = node as import("../types/index.js").StepNode
    const cap = registry.getCapability(step.uses as never)
    const schema = capabilityInputSchema(cap)
    const issues = validateStepInputAgainstSchema(step.input, schema, step.id)
    if (issues.length > 0) {
      result.valid = false
      result.errors.push(...issues)
    }
    return
  }
  if (node.type === "parallel") {
    for (const b of node.branches) {
      for (const n of b) validateNodeInputs(n, registry, result)
    }
  } else if (node.type === "branch") {
    for (const b of node.branches) {
      for (const n of b.steps) validateNodeInputs(n, registry, result)
    }
  } else if (node.type === "loop") {
    for (const n of node.steps) validateNodeInputs(n, registry, result)
  }
}

/**
 * Validate every step's input keys and literal values against capability schemas.
 * @category Validation
 */
export function validateWorkflowStepInputs(
  workflow: WorkflowManifest,
  registry: Registry,
  result: ValidationResult
): void {
  const steps = workflow.steps
  if (!Array.isArray(steps)) return
  for (const node of steps) {
    validateNodeInputs(node, registry, result)
  }
}
