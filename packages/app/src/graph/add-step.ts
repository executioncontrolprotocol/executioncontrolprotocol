import type {
  ExecutionManifest,
  IfNode,
  LoopNode,
  Node,
  ParallelNode,
  StepNode,
} from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
import {
  cloneManifest,
  finalizeManifest,
  findNodePlacement,
  allNodeIds,
  isStructureNode,
  manifestDetached,
  nodeContainsId,
  STATE_KEY_PATTERN,
  takenStateKeys,
} from "./manifest-walk.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import {
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  loopIdFromEndNodeId,
} from "./types.js"
import { STRUCTURE_EDIT_STEP_NOT_FOUND, STRUCTURE_EDIT_STRUCTURE_NOT_FOUND } from "./structure-edit.js"

/** Node id pattern from execution.base.schema.json: `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. */
const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

/**
 * Capability metadata the App needs to add a step. A step-contract script capability (`contract: "step"`,
 * `code: "script"`, e.g. a transform) gets a starting `accepts` / `returns` / `script` so it validates and takes branches.
 * @category App
 */
export interface AddStepCapability {
  /** Capability id. */
  id: string
  /** Manifest `contract`, when present. */
  contract?: string
  /** Manifest `code`, when present. */
  code?: string
}

/** True for a step-contract script capability (a transform). @category App */
export function isScriptStepCapability(capability: AddStepCapability): boolean {
  return capability.contract === "step" && capability.code === "script"
}

/**
 * Where to insert a newly added capability step. `loop-body`, `then-side`, `else-side` and `path-side` insert at the start
 * of that list; `new-path` appends a path holding the step.
 * @category App
 */
export type AddStepPlacement =
  | { kind: "top"; after?: string }
  | { kind: "loop-body"; loopId: string }
  | { kind: "then-side"; ifId: string }
  | { kind: "else-side"; ifId: string }
  | { kind: "path-side"; parallelId: string; pathIndex: number }
  | { kind: "new-path"; parallelId: string }
  | { kind: "before" | "after"; nodeId: string }

/**
 * Outcome of {@link addCapabilityStep}.
 * @category App
 */
export type AddStepResult =
  | { ok: true; manifest: ExecutionManifest; stepId: string }
  | { ok: false; reason: string }





function shortNameFromCapability(id: string): string {
  const dot = id.lastIndexOf(".")
  return (dot >= 0 ? id.slice(dot + 1) : id).toLowerCase()
}

function idStemFromShort(short: string): string {
  let stem = short
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (stem.length === 0) stem = "step"
  else if (!/^[a-z]/.test(stem)) stem = `s${stem}`
  return stem
}

function asStemFromIdStem(idStem: string): string {
  return idStem.replace(/-/g, "_")
}

function truncateStemForSuffix(stem: string, suffix: string): string {
  const maxStem = 64 - suffix.length
  if (stem.length <= maxStem) return stem
  let cut = stem.slice(0, maxStem).replace(/-+$/g, "")
  if (cut.length === 0 || !/^[a-z]/.test(cut)) cut = `s${cut}`.slice(0, maxStem)
  return cut.length === 0 ? "s" : cut
}

function uniqueNodeId(stem: string, taken: Set<string>): string {
  let n = 1
  for (;;) {
    const suffix = n === 1 ? "" : `-${n}`
    const candidate = truncateStemForSuffix(stem, suffix) + suffix
    if (NODE_ID_PATTERN.test(candidate) && !taken.has(candidate)) return candidate
    n += 1
  }
}

/**
 * Allocate a unique `as` name for a capability on this manifest.
 * @category App
 */
export function allocateAsName(manifest: ExecutionManifest, capabilityId: string): string {
  const idStem = idStemFromShort(shortNameFromCapability(capabilityId))
  return uniqueAsName(asStemFromIdStem(idStem), takenStateKeys(manifest))
}

function uniqueAsName(stem: string, taken: Set<string>): string {
  let n = 1
  for (;;) {
    const suffix = n === 1 ? "" : String(n)
    const candidate = stem + suffix
    if (STATE_KEY_PATTERN.test(candidate) && !taken.has(candidate)) return candidate
    n += 1
  }
}


function topLevelIndexAfter(manifest: ExecutionManifest, afterId: string): number | undefined {
  for (let index = 0; index < manifest.steps.length; index += 1) {
    if (nodeContainsId(manifest.steps[index]!, afterId)) return index + 1
  }
  return undefined
}

function isEnclosedInForBody(nodes: readonly Node[], structureId: string, inBody: boolean): boolean {
  for (const node of nodes) {
    if (node.id === structureId) return inBody
    if (isStepNode(node)) continue
    if (node.type === "loop") {
      const childIn = node.mode === "for"
      if (isEnclosedInForBody(node.steps, structureId, childIn)) return true
    } else if (node.type === "if") {
      if (isEnclosedInForBody(node.then, structureId, inBody)) return true
      if (node.else && isEnclosedInForBody(node.else, structureId, inBody)) return true
    } else if (node.type === "parallel") {
      for (const path of node.paths) {
        if (isEnclosedInForBody(path, structureId, inBody)) return true
      }
    }
  }
  return false
}

function placementNeedsReplaceMode(manifest: ExecutionManifest, placement: AddStepPlacement): boolean {
  if (placement.kind === "loop-body") {
    const loop = findStructure(manifest, placement.loopId)
    if (!loop || loop.type !== "loop") return false
    return loop.mode === "for"
  }
  if (placement.kind === "then-side" || placement.kind === "else-side") {
    const ifId = placement.ifId
    if (isEnclosedInForBody(manifest.steps, ifId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInForBody(detached, ifId, false)) return true
    return false
  }
  if (placement.kind === "new-path" || placement.kind === "path-side") {
    if (isEnclosedInForBody(manifest.steps, placement.parallelId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInForBody(detached, placement.parallelId, false)) return true
    return false
  }
  if (placement.kind === "before" || placement.kind === "after") {
    if (isEnclosedInForBody(manifest.steps, placement.nodeId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInForBody(detached, placement.nodeId, false)) return true
    return false
  }
  return false
}

/**
 * Insertion placement when dropping a data connection on empty canvas.
 * @category App
 */
export function placementForConnectionOrigin(
  manifest: ExecutionManifest,
  origin: { nodeId: string; handleId: string; side: "output" | "input" },
): AddStepPlacement {
  if (origin.nodeId === EXECUTION_ACCEPTS_NODE_ID && origin.side === "output") {
    const first = manifest.steps[0]
    if (!first) return { kind: "top" }
    return { kind: "before", nodeId: first.id }
  }
  const structure = findStructure(manifest, origin.nodeId)
  if (structure && origin.side === "output") {
    if (structure.type === "if") {
      if (origin.handleId === IF_THEN_HANDLE) return { kind: "then-side", ifId: structure.id }
      if (origin.handleId === IF_ELSE_HANDLE) return { kind: "else-side", ifId: structure.id }
    } else if (structure.type === "parallel" && origin.handleId.startsWith(PARALLEL_PATH_HANDLE_PREFIX)) {
      const pathIndex = Number.parseInt(origin.handleId.slice(PARALLEL_PATH_HANDLE_PREFIX.length), 10) - 1
      if (Number.isInteger(pathIndex) && pathIndex >= 0 && pathIndex < structure.paths.length) {
        return { kind: "path-side", parallelId: structure.id, pathIndex }
      }
    } else if (structure.type === "loop" && (origin.handleId === LOOP_ITEM_HANDLE || origin.handleId === LOOP_INDEX_HANDLE)) {
      const first = structure.steps[0]
      if (first) return { kind: "before", nodeId: first.id }
      return { kind: "loop-body", loopId: structure.id }
    }
  }
  const endLoopId = loopIdFromEndNodeId(origin.nodeId)
  const endOf = endLoopId ? findStructure(manifest, endLoopId) : undefined
  if (endOf?.type === "loop") {
    if (origin.side === "output") return { kind: "after", nodeId: endOf.id }
    const last = endOf.steps[endOf.steps.length - 1]
    if (last) return { kind: "after", nodeId: last.id }
    return { kind: "loop-body", loopId: endOf.id }
  }
  if (origin.side === "output") return { kind: "after", nodeId: origin.nodeId }
  return { kind: "before", nodeId: origin.nodeId }
}

function buildStep(
  manifest: ExecutionManifest,
  capability: AddStepCapability,
  placement: AddStepPlacement,
): StepNode {
  const capabilityId = capability.id
  const idStem = idStemFromShort(shortNameFromCapability(capabilityId))
  const nodeId = uniqueNodeId(idStem, allNodeIds(manifest))
  const asName = allocateAsName(manifest, capabilityId)
  const step: StepNode = { id: nodeId, uses: capabilityId, as: asName }
  if (isScriptStepCapability(capability)) {
    step.accepts = { type: "object", properties: {} }
    step.returns = { type: "object", properties: {} }
    step.script = { lang: "js", source: "return input" }
  }
  if (placementNeedsReplaceMode(manifest, placement)) step.mode = "replace"
  return step
}

/**
 * Locate a branch, parallel, or loop under `steps` or `detached`.
 * @category App
 */
export function findStructure(
  manifest: ExecutionManifest,
  id: string,
): IfNode | ParallelNode | LoopNode | undefined {
  const hit = findNodePlacement(manifest.steps, id)
  if (hit && isStructureNode(hit.node)) return hit.node
  const detached = manifestDetached(manifest)
  if (detached) {
    const hitDetached = findNodePlacement(detached, id)
    if (hitDetached && isStructureNode(hitDetached.node)) return hitDetached.node
  }
  return undefined
}

/**
 * Insert a new capability step at the given placement.
 * @category App
 */
export function addCapabilityStep(
  manifest: ExecutionManifest,
  capability: AddStepCapability,
  placement: AddStepPlacement,
): AddStepResult {
  const next = cloneManifest(manifest)
  const step = buildStep(next, capability, placement)

  if (placement.kind === "top") {
    if (placement.after !== undefined) {
      const inSteps = findNodePlacement(next.steps, placement.after)
      if (!inSteps) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
      const index = topLevelIndexAfter(next, placement.after)
      if (index === undefined) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
      next.steps.splice(index, 0, step)
    } else {
      next.steps.push(step)
    }
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "loop-body") {
    const loop = findStructure(next, placement.loopId)
    if (!loop || loop.type !== "loop") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    loop.steps.unshift(step)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "then-side") {
    const ifNode = findStructure(next, placement.ifId)
    if (!ifNode || ifNode.type !== "if") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    ifNode.then.unshift(step)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "else-side") {
    const ifNode = findStructure(next, placement.ifId)
    if (!ifNode || ifNode.type !== "if") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    ifNode.else = [step, ...(ifNode.else ?? [])]
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "path-side") {
    const parallel = findStructure(next, placement.parallelId)
    if (!parallel || parallel.type !== "parallel") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    const path = parallel.paths[placement.pathIndex]
    if (!path) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    path.unshift(step)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "new-path") {
    const parallel = findStructure(next, placement.parallelId)
    if (!parallel || parallel.type !== "parallel") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    parallel.paths.push([step])
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "before" || placement.kind === "after") {
    const hit =
      findNodePlacement(next.steps, placement.nodeId) ??
      (manifestDetached(next) ? findNodePlacement(manifestDetached(next)!, placement.nodeId) : undefined)
    if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
    const spliceIndex = placement.kind === "before" ? hit.index : hit.index + 1
    hit.parent.splice(spliceIndex, 0, step)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
}
