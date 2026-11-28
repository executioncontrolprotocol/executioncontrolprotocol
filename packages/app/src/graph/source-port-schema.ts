import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { OUTPUT_HANDLE_ID, longestMatchingPortId } from "./extract-data-edges.js"
import { flattenJsonSchemaProperties, jsonSchemaObjectProperties } from "./json-schema.js"
import { EXECUTION_ACCEPTS_NODE_ID, isStepNode } from "./io-from-schema.js"
import { locateNode } from "./manifest-walk.js"
import type { ReactFlowPort } from "./types.js"
import {
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
} from "./types.js"
import { type ValueSchemaHint, valueSchemaFromJsonSchemaProp } from "./value-schema-hint.js"

function hintToObjectSchema(hint: ValueSchemaHint | undefined): Record<string, unknown> {
  if (!hint || typeof hint !== "object") return {}
  const record = hint as Record<string, unknown>
  if (typeof record.type === "string") return structuredClone(record)
  return {}
}

function propertySchemaOnObject(schema: unknown, propertyId: string): Record<string, unknown> {
  if (propertyId === OUTPUT_HANDLE_ID) {
    return hintToObjectSchema(valueSchemaFromJsonSchemaProp(schema)) || { type: "object" }
  }
  const fields = jsonSchemaObjectProperties(schema)
  const names = fields.map((field) => field.name)
  const key = longestMatchingPortId(propertyId, names) ?? propertyId
  const hit = fields.find((field) => field.name === key)
  if (!hit) return {}
  return hintToObjectSchema(valueSchemaFromJsonSchemaProp(hit.schema)) || {}
}

function loopItemSchema(manifest: ExecutionManifest, loopId: string): Record<string, unknown> {
  const hit = locateNode(manifest, loopId)
  if (!hit || hit.node.type !== "loop" || hit.node.mode !== "forEach") return { type: "object" }
  const itemsBinding = hit.node.input?.items
  if (!itemsBinding || typeof itemsBinding !== "object") return { type: "object" }
  const ref = (itemsBinding as { $ref?: string }).$ref
  if (typeof ref !== "string" || !ref.startsWith("state.")) return { type: "object" }
  const inputKey = ref.slice("state.".length).split(".")[0]
  if (!inputKey) return { type: "object" }
  const inputField = propertySchemaOnObject(manifest.execution?.accepts, inputKey)
  if (inputField.type === "array" && inputField.items && typeof inputField.items === "object") {
    return inputField.items as Record<string, unknown>
  }
  const flat = flattenJsonSchemaProperties(inputField)
  const first = flat[0]
  if (first) return hintToObjectSchema(valueSchemaFromJsonSchemaProp(first.schema)) || { type: "object" }
  return { type: "object" }
}

/**
 * JSON Schema for a property wired from a given output port on the manifest.
 * @category App
 */
export function sourcePortPropertySchema(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  sourceHandle: string,
): Record<string, unknown> {
  if (sourceNodeId === EXECUTION_ACCEPTS_NODE_ID) {
    return propertySchemaOnObject(manifest.execution?.accepts, sourceHandle)
  }
  const hit = locateNode(manifest, sourceNodeId)
  if (!hit) return {}
  const node = hit.node
  if (isStepNode(node)) {
    return propertySchemaOnObject(node.returns, sourceHandle)
  }
  if (node.type === "loop") {
    if (sourceHandle === LOOP_INDEX_HANDLE) return { type: "integer" }
    if (sourceHandle === LOOP_ITEM_HANDLE) return loopItemSchema(manifest, node.id)
  }
  if (node.type === "if" || node.type === "parallel") {
    if (
      sourceHandle === IF_THEN_HANDLE ||
      sourceHandle === IF_ELSE_HANDLE ||
      sourceHandle.startsWith(PARALLEL_PATH_HANDLE_PREFIX)
    ) {
      return hintToObjectSchema(valueSchemaFromJsonSchemaProp(node.accepts)) || { type: "object" }
    }
    return propertySchemaOnObject(node.accepts, sourceHandle)
  }
  return {}
}

/**
 * Resolve a port's `valueSchema` hint to a JSON Schema object for new input ports.
 * @category App
 */
export function schemaFromReactFlowPort(port: ReactFlowPort): Record<string, unknown> {
  const hint = port.valueSchema
  const fromHint = hintToObjectSchema(hint)
  if (Object.keys(fromHint).length > 0) return fromHint
  return {}
}