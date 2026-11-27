import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode, StepNode } from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "./io-from-schema.js"
import { OUTPUT_HANDLE_ID, longestMatchingPortId } from "./extract-data-edges.js"
import {
  addCapabilityStep,
  placementForConnectionOrigin,
  allocateAsName,
  type AddStepResult,
  isScriptStepCapability,
  type AddStepCapability,
} from "./add-step.js"
import { addControlNode, type AddControlNodeResult } from "./structure-edit.js"
import { schemaFromReactFlowPort, sourcePortPropertySchema } from "./source-port-schema.js"
import {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  scopeForStateRef,
  sourceScope,
  sourceVisibleTo,
} from "./read-order.js"
import { analyseMergePort } from "./merge-port-scope.js"
import { addInputPort, uniquePortIdFromSource } from "./port-edit.js"
import { firstMatchingPort } from "./port-compat.js"
import {
  flattenJsonSchemaProperties,
  jsonSchemaObjectProperties,
} from "./json-schema.js"
import { typeLabelFromSchema, valueSchemaFromJsonSchemaProp } from "./value-schema-hint.js"
import type { ReactFlowPort } from "./types.js"
import {
  EMPTY_INPUT_PORT_ID,
  LOOP_COLLECT_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  LOOP_REF_HANDLE,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  loopIdFromEndNodeId,
} from "./types.js"
import { ensureStructureAs } from "./panel-edit.js"
import type { ReactFlowDataEdgeData, ReactFlowEdge } from "./types.js"
import { isRefMarker, isScriptMarker, isStateMarker, refPathFromValue, refPathsFromValue } from "./markers.js"
import {
  cleanNodes,
  cloneManifest,
  finalizeManifest,
  findNodePlacement,
  findStepPlacement,
  nodeContainsId,
} from "./manifest-walk.js"
import { isStepNode } from "./io-from-schema.js"
import {
  STRUCTURE_EDIT_EMPTY_STEPS,
  STRUCTURE_EDIT_STEP_NOT_FOUND,
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
  type StructureEditResult,
} from "./structure-edit.js"

/** @category App */
export const CONNECTION_EDIT_NOT_BINDING = "That is not a branch with a reference to remove"

/** @category App */
export const CONNECTION_EDIT_NOT_STEP = "Only a disconnected step can be reconnected"

/** @category App */
export const CONNECTION_EDIT_SOURCE_DETACHED = "Connect from a step that is in the flow"

/** @category App */
export const CONNECTION_EDIT_INPUT_ORIGIN = "Add a node after the port you dragged from, not before it"

/** @category App */
export const CONNECTION_EDIT_INSIDE = "That node is inside the disconnected step"






function findParallel(nodes: Node[], parallelId: string): ParallelNode | undefined {
  const hit = findNodePlacement(nodes, parallelId)
  if (hit && hit.node.type === "parallel") return hit.node
  return undefined
}

function findLoop(nodes: Node[], loopId: string): LoopNode | undefined {
  const hit = findNodePlacement(nodes, loopId)
  if (hit && hit.node.type === "loop") return hit.node
  return undefined
}




function appendDetached(manifest: ExecutionManifest, moved: Node[]): ExecutionManifest {
  const existing = Array.isArray(manifest.detached) ? manifest.detached : []
  return { ...manifest, detached: [...existing, ...moved] }
}

function dropDetachedRoot(manifest: ExecutionManifest, detachedId: string): ExecutionManifest | undefined {
  const list = manifest.detached
  if (!Array.isArray(list)) return undefined
  const index = list.findIndex((node) => node.id === detachedId)
  if (index < 0) return undefined
  const nextList = list.filter((_, i) => i !== index)
  if (nextList.length === 0) {
    const rest = { ...manifest }
    delete rest.detached
    return rest
  }
  return { ...manifest, detached: nextList }
}


function readInputAtPath(input: Record<string, unknown>, inputPath: string): unknown {
  const parts = inputPath.split(".")
  let current: unknown = input
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function deleteInputKey(input: Record<string, unknown>, inputPath: string): boolean {
  const parts = inputPath.split(".")
  if (parts.length === 1) {
    if (!(parts[0]! in input)) return false
    delete input[parts[0]!]
    return true
  }
  let current: Record<string, unknown> = input
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!
    const next = current[part]
    if (!next || typeof next !== "object" || Array.isArray(next)) return false
    current = next as Record<string, unknown>
  }
  const leaf = parts[parts.length - 1]!
  if (!(leaf in current)) return false
  delete current[leaf]
  return true
}

function setInputAtPath(input: Record<string, unknown>, inputPath: string, value: unknown): boolean {
  const parts = inputPath.split(".")
  if (parts.length === 1) {
    input[parts[0]!] = value
    return true
  }
  let current: Record<string, unknown> = input
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!
    const next = current[part]
    if (!next || typeof next !== "object" || Array.isArray(next)) return false
    current = next as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
  return true
}

/** A node whose `input` can hold a branch: a step, `if`, `parallel`, loop (driver) or a loop's `end` (`end:<loopId>`). */
interface InputTarget {
  /** Object whose `input` is read and written (the node, or the loop's `end`). */
  holder: { input?: Record<string, unknown> }
  kind: "step" | "if" | "parallel" | "loop" | "end"
  /** The loop, for `loop` and `end` targets. */
  loop?: LoopNode
}

function resolveInputTarget(draft: ExecutionManifest, nodeId: string): InputTarget | undefined {
  if (loopIdFromEndNodeId(nodeId)) return undefined
  const hit = findNodePlacement(draft.steps, nodeId)
  if (!hit) return undefined
  const node = hit.node
  if (isStepNode(node)) return { holder: node, kind: "step" }
  if (node.type === "loop") return { holder: node, kind: "loop", loop: node }
  return { holder: node, kind: node.type }
}

/**
 * Remove an input binding (`$ref`, `$state`, or one `$script.params` entry) from a step, `if`, `parallel`, loop driver
 * or loop `end` (`end:<loopId>`). The input becomes unbound; validation reports it when required.
 * @category App
 */
export function disconnectInput(
  manifest: ExecutionManifest,
  targetId: string,
  inputPath: string,
  paramKey?: string,
  refPath?: string,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const target = resolveInputTarget(next, targetId)
  if (!target) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const input = structuredClone(target.holder.input ?? {}) as Record<string, unknown>

  if (paramKey !== undefined) {
    const scriptValue = readInputAtPath(input, inputPath)
    if (!isScriptMarker(scriptValue)) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    const params = { ...(scriptValue.$script.params ?? {}) }
    const param = params[paramKey]
    if (refPathFromValue(param) === undefined) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    delete params[paramKey]
    const script = { ...scriptValue.$script }
    if (Object.keys(params).length > 0) script.params = params
    else delete script.params
    if (!setInputAtPath(input, inputPath, { $script: script })) {
      return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    }
  } else {
    const value = readInputAtPath(input, inputPath)
    if (!isRefMarker(value) && !isStateMarker(value)) {
      return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    }
    if (isRefMarker(value) && refPath) {
      const paths = refPathsFromValue(value) ?? []
      const nextPaths = paths.filter((path) => path !== refPath)
      if (nextPaths.length === paths.length) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
      if (nextPaths.length === 0) {
        if (!deleteInputKey(input, inputPath)) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
      } else if (nextPaths.length === 1) {
        assignInputPath(input, inputPath, { $ref: nextPaths[0]! })
      } else {
        assignInputPath(input, inputPath, { $ref: nextPaths })
      }
    } else if (!deleteInputKey(input, inputPath)) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  }

  target.holder.input = input
  return { ok: true, manifest: next }
}

function refuseIfEmptyTop(manifest: ExecutionManifest): StructureEditResult | undefined {
  const steps = cleanNodes(manifest.steps)
  if (steps.length === 0) return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  return undefined
}

/**
 * Remove a parallel path; its steps move to `detached`.
 * @category App
 */
export function deleteParallelLine(
  manifest: ExecutionManifest,
  parallelId: string,
  lineIndex: number,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const parallel = findParallel(next.steps, parallelId)
  if (!parallel || lineIndex < 0 || lineIndex >= parallel.paths.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const placement = findNodePlacement(next.steps, parallelId)!
  const moved = [...parallel.paths[lineIndex]!]
  let withDetached = appendDetached(next, moved)
  parallel.paths.splice(lineIndex, 1)
  if (parallel.paths.length === 1) {
    const survivor = parallel.paths[0]!
    placement.parent.splice(placement.index, 1, ...survivor)
  }
  withDetached = { ...withDetached, steps: cleanNodes(withDetached.steps) }
  const refused = refuseIfEmptyTop(withDetached)
  if (refused) return refused
  return { ok: true, manifest: withDetached }
}

/**
 * Disconnect a sequence link: target and following siblings move to `detached`.
 * @category App
 */
export function deleteSequenceLink(manifest: ExecutionManifest, targetId: string): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = findNodePlacement(next.steps, targetId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (hit.parent === next.steps && hit.index === 0) {
    return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  }
  const tail = hit.parent.splice(hit.index)
  let withDetached = appendDetached(next, tail)
  withDetached = { ...withDetached, steps: cleanNodes(withDetached.steps) }
  const refused = refuseIfEmptyTop(withDetached)
  if (refused) return refused
  return { ok: true, manifest: withDetached }
}

/**
 * Reattach a detached root immediately after `sourceId` in the flow.
 * @category App
 */
export function attachAfter(
  manifest: ExecutionManifest,
  sourceId: string,
  detachedId: string,
): StructureEditResult {
  const list = manifest.detached
  if (!Array.isArray(list)) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const root = list.find((node) => node.id === detachedId)
  if (!root) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (list.some((node) => node.id !== detachedId && nodeContainsId(node, detachedId))) {
    return { ok: false, reason: CONNECTION_EDIT_INSIDE }
  }
  if (sourceId === detachedId || nodeContainsId(root, sourceId)) {
    return { ok: false, reason: CONNECTION_EDIT_INSIDE }
  }

  const next = cloneManifest(manifest)
  const without = dropDetachedRoot(next, detachedId)
  if (!without) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = structuredClone(root)

  if (sourceId === EXECUTION_ACCEPTS_NODE_ID) {
    without.steps.splice(0, 0, node)
    return finalizeManifest(without)
  }

  const loop = findLoop(without.steps, sourceId)
  if (loop) {
    loop.steps.splice(0, 0, node)
    return finalizeManifest(without)
  }

  const hit = findNodePlacement(without.steps, sourceId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  hit.parent.splice(hit.index + 1, 0, node)
  return finalizeManifest(without)
}

/**
 * Whether the selected branch can be deleted (it is a `$ref` in a node's `input`), with the reason when it can't.
 * @category App
 */
export function connectorDeletePreview(
  manifest: ExecutionManifest,
  edge: ReactFlowEdge,
): { ok: true } | { ok: false; reason: string } {
  const result = deleteConnector(manifest, edge)
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

/**
 * Apply a canvas Delete action for the selected branch: remove the `$ref` from the target node's `input`. The target
 * may be a step, `if`, `parallel`, loop (driver) or loop `end`.
 * @category App
 */
export function deleteConnector(
  manifest: ExecutionManifest,
  edge: ReactFlowEdge,
): StructureEditResult {
  if (edge.data.kind !== "data") return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  const data = edge.data as ReactFlowDataEdgeData
  if (edge.target === EXECUTION_RETURNS_NODE_ID || !data.bindingPath) {
    return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  }
  return disconnectInput(manifest, edge.target, data.bindingPath, data.paramKey, data.statePath)
}

export {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
} from "./read-order.js"

export const CONNECTION_EDIT_INCOMPATIBLE = "Those ports are not compatible"

/** Same wording as validation {@link ECP_REF_AMBIGUOUS}. @category App */
export const CONNECTION_EDIT_REF_AMBIGUOUS = "Merge port refs are not on opposite sides of the same if."

/**
 * Target of a data-port connection in the manifest.
 * @category App
 */
export interface ConnectInputTarget {
  sourceNodeId: string
  sourceHandle: string
  targetStepId: string
  targetHandle: string
  /** Schema of the feeding port when known (for example from a drag origin). */
  sourcePortSchema?: Record<string, unknown>
}

function assignInputPath(input: Record<string, unknown>, inputPath: string, value: unknown): void {
  const parts = inputPath.split(".")
  if (parts.length === 1) {
    input[parts[0]!] = value
    return
  }
  let current: Record<string, unknown> = input
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    const next = current[part]
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}

/**
 * The `state.<key>[.<path>]` a branch from this output port writes. Mutates `manifest` (a draft) when the port needs a
 * key the node doesn't have yet: an `if` / `parallel` side port sets `as` (and an empty `input`), a loop `end`
 * `results` port sets `into`.
 */
function buildStateRef(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  sourceHandle: string,
  step?: StepNode,
): string | { ok: false; reason: string } {
  if (sourceNodeId === EXECUTION_ACCEPTS_NODE_ID) {
    return `state.${sourceHandle}`
  }
  const structure = findNodePlacement(manifest.steps, sourceNodeId)?.node
  if (structure?.type === "loop") {
    const asKey = structure.as
    const mode = structure.mode
    if (!asKey) return { ok: false, reason: CONNECTION_EDIT_HANDLE }
    if (sourceHandle === LOOP_ITEM_HANDLE && mode === "forEach") return `state.${asKey}`
    if (sourceHandle === LOOP_INDEX_HANDLE && mode === "for") return `state.${asKey}`
    if (sourceHandle === LOOP_INDEX_HANDLE && mode === "forEach") return `state.${asKey}Index`
    return { ok: false, reason: CONNECTION_EDIT_HANDLE }
  }
  if (structure?.type === "if") {
    if (sourceHandle !== IF_THEN_HANDLE && sourceHandle !== IF_ELSE_HANDLE) return { ok: false, reason: CONNECTION_EDIT_HANDLE }
    return `state.${ensureStructureAs(manifest, structure)}`
  }
  if (structure?.type === "parallel") {
    if (!sourceHandle.startsWith(PARALLEL_PATH_HANDLE_PREFIX)) return { ok: false, reason: CONNECTION_EDIT_HANDLE }
    return `state.${ensureStructureAs(manifest, structure)}`
  }
  const writer = step ?? resolveSourceStep(manifest, sourceNodeId)
  if (!writer) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const asKey = writer.as ?? allocateAsName(manifest, writer.uses)
  if (sourceHandle === OUTPUT_HANDLE_ID || longestMatchingPortId(sourceHandle, [OUTPUT_HANDLE_ID]) === OUTPUT_HANDLE_ID) {
    return `state.${asKey}`
  }
  const field = longestMatchingPortId(sourceHandle, [OUTPUT_HANDLE_ID, sourceHandle])
  return `state.${asKey}.${field}`
}

function resolveSourceStep(manifest: ExecutionManifest, sourceNodeId: string): StepNode | undefined {
  const hit = findStepPlacement(manifest.steps, sourceNodeId)
  return hit ? (hit.parent[hit.index] as StepNode) : undefined
}

function isDisallowedTargetHandle(handle: string): boolean {
  return handle === LOOP_REF_HANDLE || handle === LOOP_COLLECT_HANDLE
}

/**
 * Wire a step input to a `$ref` from a source port.
 * @category App
 */
function attachAfterLoopInto(
  manifest: ExecutionManifest,
  loopId: string,
  detachedId: string,
): StructureEditResult {
  const list = manifest.detached
  if (!Array.isArray(list)) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const root = list.find((node) => node.id === detachedId)
  if (!root) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (list.some((node) => node.id !== detachedId && nodeContainsId(node, detachedId))) {
    return { ok: false, reason: CONNECTION_EDIT_INSIDE }
  }
  if (loopId === detachedId || nodeContainsId(root, loopId)) {
    return { ok: false, reason: CONNECTION_EDIT_INSIDE }
  }

  const next = cloneManifest(manifest)
  const without = dropDetachedRoot(next, detachedId)
  if (!without) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = structuredClone(root)

  const hit = findNodePlacement(without.steps, loopId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  hit.parent.splice(hit.index + 1, 0, node)
  return finalizeManifest(without)
}

function placeDetachedBeforeConnect(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  _sourceHandle: string,
  detachedId: string,
): StructureEditResult {
  const endLoopId = loopIdFromEndNodeId(sourceNodeId)
  if (endLoopId) return attachAfterLoopInto(manifest, endLoopId, detachedId)
  return attachAfter(manifest, sourceNodeId, detachedId)
}

function isDetachedRootStep(manifest: ExecutionManifest, stepId: string): boolean {
  const list = manifest.detached
  if (!Array.isArray(list)) return false
  const root = list.find((node) => node.id === stepId)
  return root !== undefined && isStepNode(root)
}

/**
 * Manifest after placing a detached root step for a data-port drop (scope simulation only).
 * @category App
 */
export function placementManifestForDetachedConnect(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  sourceHandle: string,
  targetStepId: string,
): ExecutionManifest | undefined {
  const placed = placeDetachedBeforeConnect(manifest, sourceNodeId, sourceHandle, targetStepId)
  if (!placed.ok) return undefined
  return placed.manifest
}

/**
 * Bind a data input and place the target when it is a detached root step.
 * @category App
 */
export function connectInputAndAttach(
  manifest: ExecutionManifest,
  target: ConnectInputTarget,
): StructureEditResult {
  // Any attached node (step, if, parallel, loop) or a loop end node connects in place.
  if (findNodePlacement(manifest.steps, loopIdFromEndNodeId(target.targetStepId) ?? target.targetStepId)) {
    return connectInput(manifest, target)
  }
  if (!isDetachedRootStep(manifest, target.targetStepId)) {
    return { ok: false, reason: CONNECTION_EDIT_NOT_STEP }
  }
  if (detachedNodeIds(manifest).has(target.sourceNodeId)) {
    return { ok: false, reason: CONNECTION_EDIT_SOURCE_DETACHED }
  }
  const placed = placeDetachedBeforeConnect(
    manifest,
    target.sourceNodeId,
    target.sourceHandle,
    target.targetStepId,
  )
  if (!placed.ok) return placed
  return connectInput(placed.manifest, target)
}

/** Whether `handle` is an input port the target accepts a branch on (loop drivers and `repeat` depend on the mode). */
function targetHandleAllowed(target: InputTarget, handle: string): boolean {
  if (target.kind === "loop") {
    const mode = target.loop?.mode
    return (mode === "forEach" && handle === LOOP_ITEMS_HANDLE) || (mode === "for" && handle === LOOP_COUNT_HANDLE)
  }
  return true
}

/**
 * Write the `$ref` for a branch from an output port to an input port. The target may be a step, `if`, `parallel`, loop
 * driver (`items` / `count`) or loop `end` (`end:<loopId>`). When the source is an `if` / `parallel` side port without
 * `as`, or a loop `end` `results` port without `into`, that key is set in the same edit.
 * @category App
 */
export function connectInput(manifest: ExecutionManifest, target: ConnectInputTarget): StructureEditResult {
  if (target.targetStepId === target.sourceNodeId) {
    return { ok: false, reason: CONNECTION_EDIT_SELF }
  }
  if (target.targetStepId === EXECUTION_RETURNS_NODE_ID || isDisallowedTargetHandle(target.targetHandle)) {
    return { ok: false, reason: CONNECTION_EDIT_HANDLE }
  }
  if (!sourceVisibleTo(manifest, { nodeId: target.sourceNodeId, handleId: target.sourceHandle }, target.targetStepId)) {
    return { ok: false, reason: CONNECTION_EDIT_ORDER }
  }

  let next = cloneManifest(manifest)
  let targetHandle = target.targetHandle

  if (targetHandle === EMPTY_INPUT_PORT_ID) {
    const sourcePortName = target.sourceHandle === OUTPUT_HANDLE_ID ? "output" : target.sourceHandle.split(".").pop() ?? "input"
    const placement = findNodePlacement(next.steps, target.targetStepId)
    if (!placement) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
    const holder = placement.node
    if (holder.type !== "if" && holder.type !== "parallel" && !isStepNode(holder)) {
      return { ok: false, reason: CONNECTION_EDIT_HANDLE }
    }
    if (isStepNode(holder) && holder.accepts === undefined) {
      return { ok: false, reason: CONNECTION_EDIT_HANDLE }
    }
    const portId = uniquePortIdFromSource(next, holder as IfNode | ParallelNode | StepNode, sourcePortName)
    const fromHint =
      target.sourcePortSchema && Object.keys(target.sourcePortSchema).length > 0
        ? target.sourcePortSchema
        : sourcePortPropertySchema(next, target.sourceNodeId, target.sourceHandle)
    const schema = Object.keys(fromHint).length > 0 ? fromHint : { type: "object" }
    const added = addInputPort(next, target.targetStepId, portId, schema)
    if (!added.ok) return added
    next = added.manifest
    targetHandle = portId
  }

  const inputTarget = resolveInputTarget(next, target.targetStepId)
  if (!inputTarget) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (!targetHandleAllowed(inputTarget, targetHandle)) return { ok: false, reason: CONNECTION_EDIT_HANDLE }

  const sourceHit = findStepPlacement(next.steps, target.sourceNodeId)
  let sourceStep = sourceHit ? (sourceHit.parent[sourceHit.index] as StepNode) : undefined
  if (sourceStep && !sourceStep.as) {
    const withAs = { ...sourceStep, as: allocateAsName(next, sourceStep.uses) }
    sourceHit!.parent[sourceHit!.index] = withAs
    sourceStep = withAs
  }

  const refResult = buildStateRef(next, target.sourceNodeId, target.sourceHandle, sourceStep)
  if (typeof refResult !== "string") return refResult

  const input = structuredClone(inputTarget.holder.input ?? {}) as Record<string, unknown>
  const existing = readInputAtPath(input, targetHandle)
  if (isRefMarker(existing)) {
    if (inputTarget.kind === "loop") {
      assignInputPath(input, targetHandle, { $ref: refResult })
      inputTarget.holder.input = input
      return { ok: true, manifest: next }
    }
    const paths = refPathsFromValue(existing) ?? []
    if (paths.includes(refResult)) return { ok: true, manifest: next }
    const scopes = paths
      .map((path) => scopeForStateRef(next, path))
      .filter((scope): scope is NonNullable<typeof scope> => scope !== undefined)
    const incoming = sourceScope(next, { nodeId: target.sourceNodeId, handleId: target.sourceHandle })
    if (incoming) scopes.push(incoming)
    if (paths.length === 1) {
      if (analyseMergePort(scopes).valid) {
        assignInputPath(input, targetHandle, { $ref: [paths[0]!, refResult] })
      } else {
        return { ok: false, reason: CONNECTION_EDIT_REF_AMBIGUOUS }
      }
    } else {
      if (!analyseMergePort(scopes).valid) return { ok: false, reason: CONNECTION_EDIT_REF_AMBIGUOUS }
      assignInputPath(input, targetHandle, { $ref: [...paths, refResult] })
    }
  } else {
    assignInputPath(input, targetHandle, { $ref: refResult })
  }
  inputTarget.holder.input = input
  return { ok: true, manifest: next }
}

function portsFromCapabilitySchema(
  schema: Record<string, unknown> | undefined,
  io: "accepts" | "returns",
): ReactFlowPort[] {
  if (!schema) return []
  const rows = io === "accepts" ? jsonSchemaObjectProperties(schema) : flattenJsonSchemaProperties(schema)
  return rows.map((prop) => ({
    id: prop.name,
    name: prop.name.split(".").pop() ?? prop.name,
    typeLabel: typeLabelFromSchema(prop.schema, prop.required),
    valueSchema: valueSchemaFromJsonSchemaProp(prop.schema),
    required: prop.required,
  }))
}

/**
 * Insert a step from a capability menu pick after a connection drop and wire the first compatible port.
 * @category App
 */
export function insertConnectedStep(
  manifest: ExecutionManifest,
  capability: AddStepCapability & { accepts?: Record<string, unknown>; returns?: Record<string, unknown> },
  origin: { nodeId: string; handleId: string; side: "output" | "input" },
  originPort: ReactFlowPort,
): AddStepResult {
  if (origin.side === "input") {
    return { ok: false, reason: CONNECTION_EDIT_INPUT_ORIGIN }
  }
  const placement = placementForConnectionOrigin(manifest, origin)
  const added = addCapabilityStep(manifest, capability, placement)
  if (!added.ok) return added

  const sourcePortSchema = {
    ...schemaFromReactFlowPort(originPort),
    ...sourcePortPropertySchema(manifest, origin.nodeId, origin.handleId),
  }

  const candidates =
    origin.side === "output"
      ? portsFromCapabilitySchema(capability.accepts, "accepts")
      : portsFromCapabilitySchema(capability.returns, "returns")
  const match = firstMatchingPort(originPort, candidates, origin.side)

  if (origin.side === "output") {
    const skeleton = isScriptStepCapability(capability)
    const targetHandle = skeleton || !match ? EMPTY_INPUT_PORT_ID : match.id
    const wired = connectInput(added.manifest, {
      sourceNodeId: origin.nodeId,
      sourceHandle: origin.handleId,
      targetStepId: added.stepId,
      targetHandle,
      sourcePortSchema,
    })
    if (!wired.ok) return added
    return { ok: true, manifest: wired.manifest, stepId: added.stepId }
  }

  if (!match) return added
  const wired = connectInput(added.manifest, {
    sourceNodeId: added.stepId,
    sourceHandle: match.id,
    targetStepId: origin.nodeId,
    targetHandle: origin.handleId,
    sourcePortSchema,
  })
  if (!wired.ok) return added
  return { ok: true, manifest: wired.manifest, stepId: added.stepId }
}

/**
 * Insert a control node from a port drag onto the canvas and bind the origin port to a new input on it.
 * @category App
 */
export function insertConnectedControlNode(
  manifest: ExecutionManifest,
  origin: { nodeId: string; handleId: string; side: "output" | "input" },
  originPort: ReactFlowPort,
): AddControlNodeResult {
  if (origin.side === "input") {
    return { ok: false, reason: CONNECTION_EDIT_INPUT_ORIGIN }
  }
  const placement = placementForConnectionOrigin(manifest, origin)
  const added = addControlNode(manifest, placement)
  if (!added.ok) return added
  const sourcePortSchema = {
    ...schemaFromReactFlowPort(originPort),
    ...sourcePortPropertySchema(manifest, origin.nodeId, origin.handleId),
  }
  const wired = connectInput(added.manifest, {
    sourceNodeId: origin.nodeId,
    sourceHandle: origin.handleId,
    targetStepId: added.structureId,
    targetHandle: EMPTY_INPUT_PORT_ID,
    sourcePortSchema,
  })
  if (!wired.ok) return { ok: false, reason: wired.reason }
  return { ok: true, manifest: wired.manifest, structureId: added.structureId }
}

export function detachedNodeIds(manifest: ExecutionManifest): Set<string> {
  const ids = new Set<string>()
  const list = manifest.detached
  if (!Array.isArray(list)) return ids
  const walk = (nodes: Node[]): void => {
    for (const node of nodes) {
      ids.add(node.id)
      if (node.type === "if") {
        walk(node.then)
        if (node.else) walk(node.else)
      } else if (node.type === "parallel") {
        for (const path of node.paths) walk(path)
      } else if (node.type === "loop") {
        walk(node.steps)
      }
    }
  }
  walk(list)
  return ids
}
