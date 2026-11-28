import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode, StepNode, ValueMarker } from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
import { cloneManifest, finalizeManifest, freeStateKey, locateNode } from "./manifest-walk.js"
import { isRefMarker, refPathsFromValue } from "./markers.js"
import { STRUCTURE_EDIT_STEP_NOT_FOUND, STRUCTURE_EDIT_STRUCTURE_NOT_FOUND, type StructureEditResult } from "./structure-edit.js"

/** Refusal when a port name is already used. @category App */
export const PORT_EDIT_DUPLICATE = "That input name is already used"

/** Refusal when the target does not support multi-cardinal inputs. @category App */
export const PORT_EDIT_NOT_MULTI = "This node does not support extra input ports"

type MultiCardinalHolder = IfNode | ParallelNode | StepNode

function isMultiCardinalNode(node: Node): node is MultiCardinalHolder {
  if (node.type === "if" || node.type === "parallel") return true
  return isStepNode(node) && node.accepts !== undefined
}

function tunnelNodes(root: IfNode | ParallelNode | LoopNode): Node[] {
  if (root.type === "if") {
    const out = [...root.then]
    if (root.else) out.push(...root.else)
    return out
  }
  if (root.type === "parallel") return root.paths.flat()
  return [...root.steps]
}

function rewriteRefsInValue(value: unknown, fromPrefix: string, toPrefix: string): unknown {
  if (isRefMarker(value)) {
    const paths = refPathsFromValue(value) ?? []
    const next = paths.map((path) => (path.startsWith(fromPrefix) ? `${toPrefix}${path.slice(fromPrefix.length)}` : path))
    if (next.length === 0) return value
    return next.length === 1 ? { ...value, $ref: next[0]! } : { ...value, $ref: next }
  }
  if (Array.isArray(value)) return value.map((item) => rewriteRefsInValue(item, fromPrefix, toPrefix))
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) {
      out[key] = rewriteRefsInValue(child, fromPrefix, toPrefix)
    }
    return out
  }
  return value
}

function rewriteTunnelRefs(
  root: IfNode | ParallelNode,
  asKey: string,
  oldPort: string,
  newPort: string,
): void {
  const fromPrefix = `state.${asKey}.${oldPort}`
  const toPrefix = `state.${asKey}.${newPort}`
  const visit = (nodes: Node[]): void => {
    for (const node of nodes) {
      if (isStepNode(node) && node.input) {
        node.input = rewriteRefsInValue(node.input, fromPrefix, toPrefix) as StepNode["input"]
      } else if (node.type === "if") {
        visit(node.then)
        if (node.else) visit(node.else)
      } else if (node.type === "parallel") {
        for (const path of node.paths) visit(path)
      } else if (node.type === "loop") {
        visit(node.steps)
      }
    }
  }
  visit(tunnelNodes(root))
}

function acceptsProperties(holder: MultiCardinalHolder): Record<string, unknown> {
  const accepts = holder.accepts ?? { type: "object", properties: {} }
  if (!accepts.properties || typeof accepts.properties !== "object") {
    accepts.properties = {}
  }
  return accepts.properties as Record<string, unknown>
}

/**
 * Add a multi-cardinal input port on an `if`, `parallel`, or transform step.
 * @category App
 */
export function addInputPort(
  manifest: ExecutionManifest,
  nodeId: string,
  portId: string,
  propertySchema: Record<string, unknown>,
  binding?: ValueMarker | unknown,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = locateNode(next, nodeId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = hit.node
  if (!isMultiCardinalNode(node)) return { ok: false, reason: PORT_EDIT_NOT_MULTI }
  const properties = acceptsProperties(node)
  if (portId in properties || node.input?.[portId] !== undefined) {
    return { ok: false, reason: PORT_EDIT_DUPLICATE }
  }
  properties[portId] = propertySchema
  node.accepts ??= { type: "object", properties: {} }
  ;(node.accepts as Record<string, unknown>).properties = properties
  if (binding !== undefined) {
    node.input ??= {}
    node.input[portId] = binding as ValueMarker
  }
  const required = (node.accepts as { required?: string[] }).required
  if (Array.isArray(required) && !required.includes(portId)) {
    ;(node.accepts as { required: string[] }).required = [...required, portId]
  }
  return finalizeManifest(next)
}

/**
 * Rename a multi-cardinal port and rewrite tunnel readers that use `state.<as>.<old>`.
 * @category App
 */
export function renameInputPort(
  manifest: ExecutionManifest,
  nodeId: string,
  oldPort: string,
  newPort: string,
): StructureEditResult {
  if (oldPort === newPort) return { ok: true, manifest: cloneManifest(manifest) }
  const next = cloneManifest(manifest)
  const hit = locateNode(next, nodeId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = hit.node
  if (!isMultiCardinalNode(node)) return { ok: false, reason: PORT_EDIT_NOT_MULTI }
  const properties = acceptsProperties(node)
  if (!(oldPort in properties) && node.input?.[oldPort] === undefined) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  if (newPort in properties || node.input?.[newPort] !== undefined) {
    return { ok: false, reason: PORT_EDIT_DUPLICATE }
  }
  if (properties[oldPort] !== undefined) {
    properties[newPort] = properties[oldPort]
    delete properties[oldPort]
  }
  if (node.input?.[oldPort] !== undefined) {
    node.input[newPort] = node.input[oldPort]
    delete node.input[oldPort]
  }
  const required = (node.accepts as { required?: string[] } | undefined)?.required
  if (Array.isArray(required)) {
    ;(node.accepts as { required: string[] }).required = required.map((key) => (key === oldPort ? newPort : key))
  }
  if ((node.type === "if" || node.type === "parallel") && node.as) {
    rewriteTunnelRefs(node, node.as, oldPort, newPort)
  }
  return finalizeManifest(next)
}

/**
 * Remove a multi-cardinal input port and its binding.
 * @category App
 */
export function removeInputPort(manifest: ExecutionManifest, nodeId: string, portId: string): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = locateNode(next, nodeId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = hit.node
  if (!isMultiCardinalNode(node)) return { ok: false, reason: PORT_EDIT_NOT_MULTI }
  const properties = acceptsProperties(node)
  delete properties[portId]
  if (node.input) delete node.input[portId]
  const required = (node.accepts as { required?: string[] } | undefined)?.required
  if (Array.isArray(required)) {
    ;(node.accepts as { required: string[] }).required = required.filter((key) => key !== portId)
  }
  return finalizeManifest(next)
}

/**
 * Unique port id derived from a source port name (used when dropping on the empty port).
 * @category App
 */
export function uniquePortIdFromSource(manifest: ExecutionManifest, holder: MultiCardinalHolder, stem: string): string {
  const taken = new Set<string>(Object.keys(acceptsProperties(holder)))
  for (const key of Object.keys(holder.input ?? {})) taken.add(key)
  if (!taken.has(stem)) return stem
  const base = stem.replace(/[^A-Za-z0-9_]/g, "_")
  return freeStateKey(manifest, base)
}