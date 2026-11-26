import type { ExecutionManifest, Node, StepNode } from "@executioncontrolprotocol/protocol"
import { jsonSchemaObjectProperties } from "./json-schema.js"
import type { ReactFlowIoData, ReactFlowNode, ReactFlowPort } from "./types.js"
import {
  typeLabelFromSchema,
  valueSchemaFromEqlLabel,
  valueSchemaFromJsonSchemaProp,
} from "./value-schema-hint.js"

/**
 * Synthetic React Flow node id for `execution.accepts`.
 * @category App
 */
export const EXECUTION_ACCEPTS_NODE_ID = "ecp:accepts"

/**
 * Synthetic React Flow node id for `execution.returns`.
 * @category App
 */
export const EXECUTION_RETURNS_NODE_ID = "ecp:returns"

/**
 * Ports from the properties of an object JSON Schema (`accepts` / `returns`).
 * @category App
 */
export function portsFromJsonSchemaObject(schema: unknown): ReactFlowPort[] {
  return jsonSchemaObjectProperties(schema).map((field) => {
    const typeLabel = typeLabelFromSchema(field.schema, field.required)
    return {
      id: field.name,
      name: field.name,
      typeLabel,
      required: field.required,
      valueSchema: valueSchemaFromJsonSchemaProp(field.schema) ?? valueSchemaFromEqlLabel(typeLabel),
    }
  })
}

/**
 * Property names of `execution.accepts`. These seed state at run start.
 * @category App
 */
export function acceptsPropertyKeys(manifest: ExecutionManifest): Set<string> {
  return new Set(jsonSchemaObjectProperties(manifest.execution?.accepts).map((field) => field.name))
}

/**
 * Project `execution.accepts` as an output-only Inputs node. Always present, possibly empty.
 * @category App
 */
export function acceptsReactFlowNode(manifest: ExecutionManifest): ReactFlowNode {
  const data: ReactFlowIoData = {
    label: "Inputs",
    kind: "accepts",
    inputs: [],
    outputs: portsFromJsonSchemaObject(manifest.execution?.accepts),
  }
  return { id: EXECUTION_ACCEPTS_NODE_ID, type: "ecp-io", position: { x: 0, y: 0 }, data }
}

/**
 * Whether a node is a capability step (absent `type` or `"step"`).
 * @category App
 */
export function isStepNode(node: Node): node is StepNode {
  return node.type === undefined || node.type === "step"
}

function collectCommitKeys(nodes: Node[], into: Set<string>): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      if (node.as) into.add(node.as)
    } else if (node.type === "loop") {
      collectCommitKeys(node.steps, into)
    } else if (node.type === "parallel") {
      for (const path of node.paths) collectCommitKeys(path, into)
    } else if (node.type === "if") {
      collectCommitKeys(node.then, into)
      if (node.else) collectCommitKeys(node.else, into)
    }
  }
}

/**
 * State keys that can feed a `returns` port: step `as` keys and `accepts` properties.
 * @category App
 */
export function returnsSourceKeys(manifest: ExecutionManifest): Set<string> {
  const keys = acceptsPropertyKeys(manifest)
  collectCommitKeys(manifest.steps, keys)
  return keys
}

/**
 * Project `execution.returns` as an input-only Outputs node, or `undefined` when it
 * declares no properties.
 * @category App
 */
export function returnsReactFlowNode(manifest: ExecutionManifest): ReactFlowNode | undefined {
  const inputs = portsFromJsonSchemaObject(manifest.execution?.returns)
  if (inputs.length === 0) return undefined
  const sources = returnsSourceKeys(manifest)
  for (const port of inputs) {
    if (!sources.has(port.id)) continue
    port.binding = "ref"
    port.refPath = port.id
  }
  const data: ReactFlowIoData = { label: "Outputs", kind: "returns", inputs, outputs: [] }
  return { id: EXECUTION_RETURNS_NODE_ID, type: "ecp-io", position: { x: 0, y: 0 }, data }
}
