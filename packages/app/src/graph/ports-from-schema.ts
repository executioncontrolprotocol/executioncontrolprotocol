import type { StepNode } from "@executioncontrolprotocol/protocol"
import {
  EXPR_HANDLE_ID,
  OUTPUT_HANDLE_ID,
  parseStateRef,
  walkInputExprs,
  walkInputRefs,
} from "./extract-data-edges.js"
import {
  flattenJsonSchemaProperties,
  isJsonObject,
  jsonSchemaObjectProperties,
} from "./json-schema.js"
import { isExprMarker, isRefMarker, isScriptMarker, refPathFromValue } from "./markers.js"
import type { CapabilityIoSchemas, ReactFlowPort } from "./types.js"
import {
  typeLabelFromSchema,
  valueSchemaFromEqlLabel,
  valueSchemasFromCapabilitySchema,
} from "./value-schema-hint.js"

const LITERAL_PREVIEW_MAX = 56
const UNKNOWN_TYPE = "unknown"

/**
 * Compact string form of a literal input value (for previews and the node panel).
 * @category App
 */
export function formatLiteralValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === undefined) return "undefined"
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Truncate a literal for port-row display, ending with an ellipsis when cut.
 * @category App
 */
export function truncateLiteralPreview(full: string, max = LITERAL_PREVIEW_MAX): string {
  if (full.length <= max) return full
  return `${full.slice(0, Math.max(0, max - 1))}\u2026`
}

function shortRefPath(rawRef: string): string {
  const parsed = parseStateRef(rawRef)
  if (!parsed) return rawRef
  return parsed.fieldPath ? `${parsed.asKey}.${parsed.fieldPath}` : parsed.asKey
}

function clearBinding(port: ReactFlowPort): void {
  delete port.valuePreview
  delete port.valueTitle
  delete port.refPath
  delete port.refOptional
  delete port.exprSource
  delete port.scriptSource
  delete port.scriptPath
}

function setLiteral(port: ReactFlowPort, value: unknown): void {
  clearBinding(port)
  const full = formatLiteralValue(value)
  port.binding = "literal"
  port.valueTitle = full
  port.valuePreview = truncateLiteralPreview(full)
}

function setRef(port: ReactFlowPort, rawRef: string, optional: boolean): void {
  clearBinding(port)
  port.binding = "ref"
  port.refPath = shortRefPath(rawRef)
  if (optional) port.refOptional = true
}

function setExpr(port: ReactFlowPort, source: string): void {
  clearBinding(port)
  port.binding = "expr"
  port.exprSource = source
  port.valueTitle = source
  port.valuePreview = truncateLiteralPreview(source.replace(/\s+/g, " ").trim())
}

function setScript(port: ReactFlowPort, script: { source?: string; path?: string }): void {
  clearBinding(port)
  port.binding = "script"
  if (script.path !== undefined) {
    port.scriptPath = script.path
    port.valuePreview = truncateLiteralPreview(script.path)
    port.valueTitle = script.path
  }
  if (script.source !== undefined) {
    port.scriptSource = script.source
    port.valuePreview = truncateLiteralPreview(script.source.replace(/\s+/g, " ").trim())
    port.valueTitle = script.source
  }
}

function getOrCreateInput(
  inputs: ReactFlowPort[],
  byName: Map<string, ReactFlowPort>,
  name: string,
): ReactFlowPort {
  const existing = byName.get(name)
  if (existing) return existing
  const port: ReactFlowPort = { id: name, name, typeLabel: UNKNOWN_TYPE, required: false }
  inputs.push(port)
  byName.set(name, port)
  return port
}

function applyInputBindings(inputs: ReactFlowPort[], step: StepNode): void {
  const byName = new Map(inputs.map((port) => [port.name, port]))

  for (const [name, value] of Object.entries(step.input ?? {})) {
    const port = getOrCreateInput(inputs, byName, name)

    const directRef = refPathFromValue(value)
    if (directRef !== undefined) {
      setRef(port, directRef, isRefMarker(value) && value.optional === true)
      continue
    }
    if (isExprMarker(value)) {
      setExpr(port, value.$expr)
      continue
    }
    if (isScriptMarker(value)) {
      setScript(port, value.$script)
      continue
    }

    // A literal object or array can hold markers deeper down: keep the top-level literal
    // preview and add a dotted port per nested marker. Scripts go first: their params are
    // reported at the script's own path and must not replace the script binding.
    walkNestedScripts(value, name, (inputPath, script) => {
      setScript(getOrCreateInput(inputs, byName, inputPath), script)
    })
    walkInputRefs(value, name, (inputPath, rawRef) => {
      const nested = getOrCreateInput(inputs, byName, inputPath)
      if (nested.binding === "script") return
      setRef(nested, rawRef, false)
    })
    walkInputExprs(value, name, (inputPath, source) => {
      const nested = getOrCreateInput(inputs, byName, inputPath)
      if (nested.binding === "script") return
      setExpr(nested, source)
    })
    setLiteral(port, value)
  }

  if (step.expr !== undefined && !byName.has(EXPR_HANDLE_ID)) {
    inputs.push(exprGatePort(step.expr))
  }
}

function walkNestedScripts(
  value: unknown,
  path: string,
  visit: (inputPath: string, script: { source?: string; path?: string }) => void,
): void {
  if (isScriptMarker(value)) {
    visit(path, value.$script)
    return
  }
  if (refPathFromValue(value) !== undefined || isExprMarker(value)) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkNestedScripts(item, `${path}.${index}`, visit))
    return
  }
  if (isJsonObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) continue
      walkNestedScripts(child, `${path}.${key}`, visit)
    }
  }
}

function exprGatePort(source?: string): ReactFlowPort {
  return {
    id: EXPR_HANDLE_ID,
    name: EXPR_HANDLE_ID,
    typeLabel: EXPR_HANDLE_ID,
    required: false,
    binding: "expr",
    ...(source !== undefined ? { exprSource: source } : {}),
  }
}

/**
 * Ensure an output port exists for a data-edge source handle.
 * @category App
 */
export function ensureOutputPort(outputs: ReactFlowPort[], handleId: string): void {
  if (outputs.some((port) => port.id === handleId)) return
  outputs.push({ id: handleId, name: handleId, typeLabel: UNKNOWN_TYPE })
}

/**
 * Ensure an input port exists for a data-edge target handle (including nested paths and
 * the synthetic `expr` gate handle).
 * @category App
 */
export function ensureInputPort(inputs: ReactFlowPort[], handleId: string): void {
  if (inputs.some((port) => port.id === handleId)) return
  if (handleId === EXPR_HANDLE_ID) {
    inputs.push(exprGatePort())
    return
  }
  inputs.push({ id: handleId, name: handleId, typeLabel: UNKNOWN_TYPE, required: false })
}

/**
 * Build input and output ports for a step from its capability's JSON Schemas, falling
 * back to the step's `input` keys, then annotate each input with its binding
 * (literal, `$ref` / `$state`, `$expr` or `$script`). A gated step gets an `expr` port.
 * Outputs always include the whole-document `output` handle.
 * @category App
 */
export function portsForStep(
  step: StepNode,
  capabilitySchemas?: CapabilityIoSchemas,
): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const acceptsSchema = step.accepts ?? capabilitySchemas?.accepts
  const returnsSchema = step.returns ?? capabilitySchemas?.returns
  const inputHints = valueSchemasFromCapabilitySchema(acceptsSchema)

  const inputs: ReactFlowPort[] = []
  for (const field of jsonSchemaObjectProperties(acceptsSchema)) {
    const typeLabel = typeLabelFromSchema(field.schema, field.required)
    const hint = inputHints.get(field.name) ?? valueSchemaFromEqlLabel(typeLabel)
    inputs.push({
      id: field.name,
      name: field.name,
      typeLabel,
      required: field.required,
      ...(hint ? { valueSchema: hint } : {}),
    })
  }
  applyInputBindings(inputs, step)

  const outputs: ReactFlowPort[] = []
  const outputFields = flattenJsonSchemaProperties(returnsSchema)
  if (!outputFields.some((field) => field.name === OUTPUT_HANDLE_ID)) {
    outputs.push({
      id: OUTPUT_HANDLE_ID,
      name: OUTPUT_HANDLE_ID,
      typeLabel: "object",
      valueSchema: { type: "object" },
    })
  }
  for (const field of outputFields) {
    outputs.push({
      id: field.name,
      name: field.name,
      typeLabel: typeLabelFromSchema(field.schema, field.required),
      valueSchema: field.schema,
    })
  }
  return { inputs, outputs }
}
