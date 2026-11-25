import type {
  BranchNode,
  ExecutionManifest,
  LoopNode,
  Node,
  ParallelNode,
  StepNode,
} from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "./io-from-schema.js"
import { EXPR_HANDLE_ID, OUTPUT_HANDLE_ID, longestMatchingPortId } from "./extract-data-edges.js"
import {
  addCapabilityStep,
  placementForConnectionOrigin,
  allocateAsName,
  type AddStepResult,
} from "./add-step.js"
import {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  sourceVisibleTo,
} from "./read-order.js"
import { firstMatchingPort } from "./port-compat.js"
import {
  flattenJsonSchemaProperties,
  jsonSchemaObjectProperties,
} from "./json-schema.js"
import { typeLabelFromSchema, valueSchemaFromJsonSchemaProp } from "./value-schema-hint.js"
import type { ReactFlowPort } from "./types.js"
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_COLLECT_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_INTO_HANDLE,
  LOOP_REF_HANDLE,
} from "./types.js"
import type { ReactFlowDataEdgeData, ReactFlowEdge, ReactFlowRouteEdgeData } from "./types.js"
import { isRefMarker, isScriptMarker, isStateMarker, refPathFromValue } from "./markers.js"
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
export const CONNECTION_EDIT_NOT_BINDING = "Edit the expression or the structure in its panel"

/** @category App */
export const CONNECTION_EDIT_NOT_STEP = "Only a disconnected step can be reconnected"

/** @category App */
export const CONNECTION_EDIT_SOURCE_DETACHED = "Connect from a step that is in the flow"

/** @category App */
export const CONNECTION_EDIT_LOOP = "Delete the loop from its container menu"

/** @category App */
export const CONNECTION_EDIT_INSIDE = "That node is inside the disconnected step"






function findBranch(nodes: Node[], branchId: string): BranchNode | undefined {
  const hit = findNodePlacement(nodes, branchId)
  if (hit && hit.node.type === "branch") return hit.node
  return undefined
}

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

/**
 * Remove a step input binding (`$ref`, `$state`, or one `$script.params` entry).
 * @category App
 */
export function disconnectInput(
  manifest: ExecutionManifest,
  stepId: string,
  inputPath: string,
  paramKey?: string,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = findStepPlacement(next.steps, stepId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const step = hit.parent[hit.index] as StepNode
  const input = structuredClone(step.input ?? {}) as Record<string, unknown>

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
    if (!deleteInputKey(input, inputPath)) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  }

  hit.parent[hit.index] = { ...step, input: input as StepNode["input"] }
  return { ok: true, manifest: next }
}

function refuseIfEmptyTop(manifest: ExecutionManifest): StructureEditResult | undefined {
  const steps = cleanNodes(manifest.steps)
  if (steps.length === 0) return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  return undefined
}

/**
 * Remove a branch arm; its steps move to `detached`.
 * @category App
 */
export function deleteArm(manifest: ExecutionManifest, branchId: string, armIndex: number): StructureEditResult {
  const next = cloneManifest(manifest)
  const branch = findBranch(next.steps, branchId)
  if (!branch || armIndex < 0 || armIndex >= branch.branches.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const placement = findNodePlacement(next.steps, branchId)!
  const arm = branch.branches[armIndex]!
  const moved = [...arm.steps]
  let withDetached = appendDetached(next, moved)
  branch.branches.splice(armIndex, 1)
  if (branch.branches.length === 0) {
    placement.parent.splice(placement.index, 1)
  }
  withDetached = { ...withDetached, steps: cleanNodes(withDetached.steps) }
  const refused = refuseIfEmptyTop(withDetached)
  if (refused) return refused
  return { ok: true, manifest: withDetached }
}

/**
 * Remove a parallel line; its steps move to `detached`.
 * @category App
 */
export function deleteParallelLine(
  manifest: ExecutionManifest,
  parallelId: string,
  lineIndex: number,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const parallel = findParallel(next.steps, parallelId)
  if (!parallel || lineIndex < 0 || lineIndex >= parallel.branches.length) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const placement = findNodePlacement(next.steps, parallelId)!
  const moved = [...parallel.branches[lineIndex]!]
  let withDetached = appendDetached(next, moved)
  parallel.branches.splice(lineIndex, 1)
  if (parallel.branches.length === 1) {
    const survivor = parallel.branches[0]!
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
 * Attach a detached root as a new branch arm.
 * @category App
 */
export function attachAsArm(
  manifest: ExecutionManifest,
  branchId: string,
  detachedId: string,
): StructureEditResult {
  const list = manifest.detached
  if (!Array.isArray(list)) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const root = list.find((node) => node.id === detachedId)
  if (!root) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (nodeContainsId(root, branchId)) return { ok: false, reason: CONNECTION_EDIT_INSIDE }

  const next = cloneManifest(manifest)
  const branch = findBranch(next.steps, branchId)
  if (!branch) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }

  const without = dropDetachedRoot(next, detachedId)
  if (!without) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = structuredClone(root)
  const defaultIndex = branch.branches.findIndex((arm) => arm.expr === undefined)
  const arm = { expr: "(state) => true", steps: [node] }
  if (defaultIndex >= 0) branch.branches.splice(defaultIndex, 0, arm)
  else branch.branches.push(arm)
  return finalizeManifest(without)
}

/**
 * Attach a detached root as a new parallel line.
 * @category App
 */
export function attachAsLine(
  manifest: ExecutionManifest,
  parallelId: string,
  detachedId: string,
): StructureEditResult {
  const list = manifest.detached
  if (!Array.isArray(list)) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const root = list.find((node) => node.id === detachedId)
  if (!root) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  if (nodeContainsId(root, parallelId)) return { ok: false, reason: CONNECTION_EDIT_INSIDE }

  const next = cloneManifest(manifest)
  const parallel = findParallel(next.steps, parallelId)
  if (!parallel) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }

  const without = dropDetachedRoot(next, detachedId)
  if (!without) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const node = structuredClone(root)
  parallel.branches.push([node])
  return finalizeManifest(without)
}

/**
 * Whether the connector for this edge can be deleted from the canvas menu.
 * @category App
 */
export function connectorDeletePreview(
  manifest: ExecutionManifest,
  edge: ReactFlowEdge,
  level: number,
): { ok: true } | { ok: false; reason: string } {
  if (edge.data.kind === "data") {
    const data = edge.data as ReactFlowDataEdgeData
    if (edge.target === EXECUTION_RETURNS_NODE_ID || findLoop(manifest.steps, edge.target)) {
      return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    }
    if (!findStepPlacement(manifest.steps, edge.target)) {
      return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    }
    if (edge.targetHandle === EXPR_HANDLE_ID || !data.bindingPath) {
      return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    }
    return { ok: true }
  }
  if (edge.data.kind !== "route") return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  const route = edge.data as ReactFlowRouteEdgeData
  const entry = route.levels[level]
  if (!entry) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  if (entry.route === "loop") return { ok: false, reason: CONNECTION_EDIT_LOOP }
  if (entry.route === "sequence" && edge.source === EXECUTION_ACCEPTS_NODE_ID) {
    return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  }
  if (entry.route === "branch" && entry.structureId !== undefined && entry.armIndex !== undefined) return { ok: true }
  if (entry.route === "parallel" && entry.structureId !== undefined && entry.armIndex !== undefined) return { ok: true }
  if (entry.route === "sequence") return { ok: true }
  return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
}

/**
 * Apply a canvas Delete action for the selected edge / route level.
 * @category App
 */
export function deleteConnector(
  manifest: ExecutionManifest,
  edge: ReactFlowEdge,
  level: number,
): StructureEditResult {
  if (edge.data.kind === "data") {
    const data = edge.data as ReactFlowDataEdgeData
    const bindingPath = data.bindingPath
    if (!bindingPath) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
    return disconnectInput(manifest, edge.target, bindingPath, data.paramKey)
  }
  const route = edge.data as ReactFlowRouteEdgeData
  const entry = route.levels[level]
  if (!entry) return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
  if (entry.route === "branch" && entry.structureId !== undefined && entry.armIndex !== undefined) {
    return deleteArm(manifest, entry.structureId, entry.armIndex)
  }
  if (entry.route === "parallel" && entry.structureId !== undefined && entry.armIndex !== undefined) {
    return deleteParallelLine(manifest, entry.structureId, entry.armIndex)
  }
  if (entry.route === "sequence") return deleteSequenceLink(manifest, edge.target)
  return { ok: false, reason: CONNECTION_EDIT_NOT_BINDING }
}

/**
 * Collect every node id under `manifest.detached` (for connectivity exemptions).
 * @category App
 */
export {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
} from "./read-order.js"

export const CONNECTION_EDIT_INCOMPATIBLE = "Those ports are not compatible"

/**
 * Target of a data-port connection in the manifest.
 * @category App
 */
export interface ConnectInputTarget {
  sourceNodeId: string
  sourceHandle: string
  targetStepId: string
  targetHandle: string
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

function buildStateRef(
  manifest: ExecutionManifest,
  sourceNodeId: string,
  sourceHandle: string,
  step?: StepNode,
): string | { ok: false; reason: string } {
  if (sourceNodeId === EXECUTION_ACCEPTS_NODE_ID) {
    return `state.${sourceHandle}`
  }
  const loopPlacement = findNodePlacement(manifest.steps, sourceNodeId)
  if (loopPlacement?.node.type === "loop") {
    const loop = loopPlacement.node as LoopNode
    if (sourceHandle === LOOP_ITEM_HANDLE) {
      const asKey = loop.as
      if (!asKey) return { ok: false, reason: CONNECTION_EDIT_HANDLE }
      return `state.${asKey}`
    }
    if (sourceHandle === LOOP_INTO_HANDLE) {
      const into = loop.into
      if (!into) return { ok: false, reason: CONNECTION_EDIT_HANDLE }
      return `state.${into}`
    }
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
  return (
    handle === EXPR_HANDLE_ID ||
    handle === LOOP_REF_HANDLE ||
    handle === LOOP_COLLECT_HANDLE ||
    handle === FLOW_IN_HANDLE ||
    handle === FLOW_OUT_HANDLE
  )
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
  sourceHandle: string,
  detachedId: string,
): StructureEditResult {
  if (sourceHandle === LOOP_INTO_HANDLE) {
    return attachAfterLoopInto(manifest, sourceNodeId, detachedId)
  }
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
  if (findStepPlacement(manifest.steps, target.targetStepId)) {
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

  const next = cloneManifest(manifest)
  const targetHit = findStepPlacement(next.steps, target.targetStepId)
  if (!targetHit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }

  const sourceHit = findStepPlacement(next.steps, target.sourceNodeId)
  let sourceStep = sourceHit ? (sourceHit.parent[sourceHit.index] as StepNode) : undefined
  if (sourceStep && !sourceStep.as) {
    const withAs = { ...sourceStep, as: allocateAsName(next, sourceStep.uses) }
    sourceHit!.parent[sourceHit!.index] = withAs
    sourceStep = withAs
  }

  const refResult = buildStateRef(next, target.sourceNodeId, target.sourceHandle, sourceStep)
  if (typeof refResult !== "string") return refResult

  const step = targetHit.parent[targetHit.index] as StepNode
  const input = structuredClone(step.input ?? {}) as Record<string, unknown>
  assignInputPath(input, target.targetHandle, { $ref: refResult })
  targetHit.parent[targetHit.index] = { ...step, input: input as StepNode["input"] }

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
  capability: { id: string; accepts?: Record<string, unknown>; returns?: Record<string, unknown> },
  origin: { nodeId: string; handleId: string; side: "output" | "input" },
  originPort: ReactFlowPort,
): AddStepResult {
  const placement = placementForConnectionOrigin(manifest, origin)
  const added = addCapabilityStep(manifest, { id: capability.id }, placement)
  if (!added.ok) return added

  const candidates =
    origin.side === "output"
      ? portsFromCapabilitySchema(capability.accepts, "accepts")
      : portsFromCapabilitySchema(capability.returns, "returns")
  const match = firstMatchingPort(originPort, candidates, origin.side)
  if (!match) return added

  if (origin.side === "output") {
    const wired = connectInput(added.manifest, {
      sourceNodeId: origin.nodeId,
      sourceHandle: origin.handleId,
      targetStepId: added.stepId,
      targetHandle: match.id,
    })
    if (!wired.ok) return added
    return { ok: true, manifest: wired.manifest, stepId: added.stepId }
  }

  const wired = connectInput(added.manifest, {
    sourceNodeId: added.stepId,
    sourceHandle: match.id,
    targetStepId: origin.nodeId,
    targetHandle: origin.handleId,
  })
  if (!wired.ok) return added
  return { ok: true, manifest: wired.manifest, stepId: added.stepId }
}

export function detachedNodeIds(manifest: ExecutionManifest): Set<string> {
  const ids = new Set<string>()
  const list = manifest.detached
  if (!Array.isArray(list)) return ids
  const walk = (nodes: Node[]): void => {
    for (const node of nodes) {
      ids.add(node.id)
      if (node.type === "branch") {
        for (const arm of node.branches) walk(arm.steps)
      } else if (node.type === "parallel") {
        for (const line of node.branches) walk(line)
      } else if (node.type === "loop") {
        walk(node.steps)
      }
    }
  }
  walk(list)
  return ids
}