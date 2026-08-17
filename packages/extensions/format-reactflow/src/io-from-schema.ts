import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import type { ReactFlowIoData, ReactFlowNode, ReactFlowPort } from "./types.js"
import { valueSchemaFromEqlLabel, valueSchemaFromJsonSchemaProp } from "./value-schema-hint.js"

/** Synthetic React Flow node id for `workflow.accepts`. @category Encoding */
export const WORKFLOW_ACCEPTS_NODE_ID = "ecp:accepts"

/** Synthetic React Flow node id for `workflow.returns`. @category Encoding */
export const WORKFLOW_RETURNS_NODE_ID = "ecp:returns"

function isJsonSchemaObject(schema: unknown): schema is Record<string, unknown> {
  return schema !== null && typeof schema === "object" && !Array.isArray(schema)
}

/**
 * List object-schema properties for workflow `accepts` / `returns`.
 * @category Encoding
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

function typeLabelFromSchema(schema: Record<string, unknown>, required: boolean): string {
  const t = schema.type
  const base = typeof t === "string" ? t : "unknown"
  return required ? `${base}!` : base
}

/**
 * Ports from a JSON Schema object (`accepts` / `returns` properties).
 * @category Encoding
 */
export function portsFromJsonSchemaObject(
  schema: Record<string, unknown> | undefined
): ReactFlowPort[] {
  return jsonSchemaObjectProperties(schema).map((field) => {
    const typeLabel = typeLabelFromSchema(field.schema, field.required)
    const port: ReactFlowPort = {
      id: field.name,
      name: field.name,
      typeLabel,
      required: field.required,
      valueSchema: valueSchemaFromJsonSchemaProp(field.schema) ?? valueSchemaFromEqlLabel(typeLabel),
    }
    return port
  })
}

/**
 * Project workflow `accepts` as an output-only Inputs node (always present).
 * @category Encoding
 */
export function acceptsReactFlowNode(manifest: WorkflowManifest): ReactFlowNode {
  const outputs = portsFromJsonSchemaObject(manifest.workflow.accepts)
  const data: ReactFlowIoData = {
    label: "Inputs",
    kind: "accepts",
    inputs: [],
    outputs,
  }
  return {
    id: WORKFLOW_ACCEPTS_NODE_ID,
    type: "ecp-io",
    position: { x: 0, y: 0 },
    data,
  }
}

/**
 * Project workflow `returns` as an input-only Outputs node when it has properties.
 * @category Encoding
 */
export function returnsReactFlowNode(manifest: WorkflowManifest): ReactFlowNode | undefined {
  const inputs = portsFromJsonSchemaObject(manifest.workflow.returns)
  if (inputs.length === 0) return undefined
  const data: ReactFlowIoData = {
    label: "Outputs",
    kind: "returns",
    inputs,
    outputs: [],
  }
  return {
    id: WORKFLOW_RETURNS_NODE_ID,
    type: "ecp-io",
    position: { x: 0, y: 0 },
    data,
  }
}
