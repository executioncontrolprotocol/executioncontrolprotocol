import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import type { ReactFlowIoData, ReactFlowNode, ReactFlowPort } from "./types.js"
import {
  isFileValueSchemaHint,
  valueSchemaFromEqlLabel,
  valueSchemaFromJsonSchemaProp,
} from "./value-schema-hint.js"

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
  if (isFileValueSchemaHint(schema)) {
    return required ? "file!" : "file"
  }
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

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

function collectCommitKeys(nodes: WorkflowNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      if (node.as) into.add(node.as)
      continue
    }
    if (node.type === "parallel") {
      for (const branch of node.branches) collectCommitKeys(branch, into)
      continue
    }
    if (node.type === "branch") {
      for (const arm of node.branches) collectCommitKeys(arm.steps, into)
      continue
    }
    collectCommitKeys(node.steps, into)
  }
}

/**
 * State keys that can source a `returns` port (step `.as` or `accepts` properties).
 * @category Encoding
 */
export function returnsSourceKeys(manifest: WorkflowManifest): Set<string> {
  const keys = new Set(
    jsonSchemaObjectProperties(manifest.workflow.accepts).map((field) => field.name)
  )
  collectCommitKeys(manifest.steps, keys)
  return keys
}

function annotateReturnsPorts(manifest: WorkflowManifest, ports: ReactFlowPort[]): void {
  const sources = returnsSourceKeys(manifest)
  for (const port of ports) {
    const asKey = port.id.includes(".") ? port.id.slice(0, port.id.indexOf(".")) : port.id
    if (!sources.has(asKey)) continue
    port.binding = "ref"
    port.refPath = port.id
  }
}

/**
 * Project workflow `returns` as an input-only Outputs node when it has properties.
 * @category Encoding
 */
export function returnsReactFlowNode(manifest: WorkflowManifest): ReactFlowNode | undefined {
  const inputs = portsFromJsonSchemaObject(manifest.workflow.returns)
  if (inputs.length === 0) return undefined
  annotateReturnsPorts(manifest, inputs)
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
