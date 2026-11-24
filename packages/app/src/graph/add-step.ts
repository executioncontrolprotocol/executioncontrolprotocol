import type {
  BranchNode,
  ExecutionManifest,
  LoopNode,
  Node,
  ParallelNode,
  StepNode,
} from "@executioncontrolprotocol/protocol"
import { acceptsPropertyKeys } from "./io-from-schema.js"
import { isStepNode } from "./io-from-schema.js"
import {
  cloneManifest,
  finalizeManifest,
  findNodePlacement,
  allNodeIds,
  isStructureNode,
  manifestDetached,
  nodeContainsId,
} from "./manifest-walk.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import { LOOP_INTO_HANDLE, LOOP_ITEM_HANDLE } from "./types.js"
import { STRUCTURE_EDIT_STEP_NOT_FOUND, STRUCTURE_EDIT_STRUCTURE_NOT_FOUND } from "./structure-edit.js"

/** Node id pattern from execution.base.schema.json: `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. */
const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

/** Step `as` pattern from execution.base.schema.json: `^[A-Za-z_][A-Za-z0-9_]*$`. */
const AS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Where to insert a newly added capability step.
 * @category App
 */
export type AddStepPlacement =
  | { kind: "top"; after?: string }
  | { kind: "loop-body"; loopId: string }
  | { kind: "new-arm"; branchId: string }
  | { kind: "new-line"; parallelId: string }
  | { kind: "before" | "after"; nodeId: string }

/**
 * Outcome of {@link addCapabilityStep}.
 * @category App
 */
export type AddStepResult =
  | { ok: true; manifest: ExecutionManifest; stepId: string }
  | { ok: false; reason: string }





function collectStepAs(nodes: readonly Node[], out: Set<string>): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      if (typeof node.as === "string") out.add(node.as)
      continue
    }
    if (node.type === "loop") {
      if (typeof node.as === "string") out.add(node.as)
      if (typeof node.into === "string") out.add(node.into)
      collectStepAs(node.steps, out)
    } else if (node.type === "branch") {
      for (const arm of node.branches) collectStepAs(arm.steps, out)
    } else if (node.type === "parallel") {
      for (const line of node.branches) collectStepAs(line, out)
    }
  }
}

function allTakenAs(manifest: ExecutionManifest): Set<string> {
  const names = new Set<string>()
  collectStepAs(manifest.steps, names)
  const detached = manifestDetached(manifest)
  if (detached) collectStepAs(detached, names)
  for (const key of acceptsPropertyKeys(manifest)) names.add(key)
  return names
}

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
  return uniqueAsName(asStemFromIdStem(idStem), allTakenAs(manifest))
}

function uniqueAsName(stem: string, taken: Set<string>): string {
  let n = 1
  for (;;) {
    const suffix = n === 1 ? "" : String(n)
    const candidate = stem + suffix
    if (AS_PATTERN.test(candidate) && !taken.has(candidate)) return candidate
    n += 1
  }
}


function topLevelIndexAfter(manifest: ExecutionManifest, afterId: string): number | undefined {
  for (let index = 0; index < manifest.steps.length; index += 1) {
    if (nodeContainsId(manifest.steps[index]!, afterId)) return index + 1
  }
  return undefined
}

function isEnclosedInWhileOrForBody(nodes: readonly Node[], structureId: string, inBody: boolean): boolean {
  for (const node of nodes) {
    if (node.id === structureId) return inBody
    if (isStepNode(node)) continue
    if (node.type === "loop") {
      const mode = node.mode ?? "while"
      const childIn = mode === "while" || mode === "for"
      if (isEnclosedInWhileOrForBody(node.steps, structureId, childIn)) return true
    } else if (node.type === "branch") {
      for (const arm of node.branches) {
        if (isEnclosedInWhileOrForBody(arm.steps, structureId, inBody)) return true
      }
    } else if (node.type === "parallel") {
      for (const line of node.branches) {
        if (isEnclosedInWhileOrForBody(line, structureId, inBody)) return true
      }
    }
  }
  return false
}

function placementNeedsReplaceMode(manifest: ExecutionManifest, placement: AddStepPlacement): boolean {
  if (placement.kind === "loop-body") {
    const loop = findStructure(manifest, placement.loopId)
    if (!loop || loop.type !== "loop") return false
    const mode = loop.mode ?? "while"
    return mode === "while" || mode === "for"
  }
  if (placement.kind === "new-arm") {
    if (isEnclosedInWhileOrForBody(manifest.steps, placement.branchId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInWhileOrForBody(detached, placement.branchId, false)) return true
    return false
  }
  if (placement.kind === "new-line") {
    if (isEnclosedInWhileOrForBody(manifest.steps, placement.parallelId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInWhileOrForBody(detached, placement.parallelId, false)) return true
    return false
  }
  if (placement.kind === "before" || placement.kind === "after") {
    if (isEnclosedInWhileOrForBody(manifest.steps, placement.nodeId, false)) return true
    const detached = manifestDetached(manifest)
    if (detached && isEnclosedInWhileOrForBody(detached, placement.nodeId, false)) return true
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
  const loop = findStructure(manifest, origin.nodeId)
  if (loop?.type === "loop") {
    if (origin.handleId === LOOP_ITEM_HANDLE) {
      const first = loop.steps[0]
      if (first) return { kind: "before", nodeId: first.id }
      return { kind: "loop-body", loopId: loop.id }
    }
    if (origin.handleId === LOOP_INTO_HANDLE) {
      return { kind: "after", nodeId: loop.id }
    }
  }
  if (origin.side === "output") return { kind: "after", nodeId: origin.nodeId }
  return { kind: "before", nodeId: origin.nodeId }
}

function buildStep(
  manifest: ExecutionManifest,
  capabilityId: string,
  placement: AddStepPlacement,
): StepNode {
  const idStem = idStemFromShort(shortNameFromCapability(capabilityId))
  const nodeId = uniqueNodeId(idStem, allNodeIds(manifest))
  const asName = allocateAsName(manifest, capabilityId)
  const step: StepNode = { id: nodeId, uses: capabilityId, as: asName }
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
): BranchNode | ParallelNode | LoopNode | undefined {
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
  capability: { id: string },
  placement: AddStepPlacement,
): AddStepResult {
  const next = cloneManifest(manifest)
  const step = buildStep(next, capability.id, placement)

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
    loop.steps.push(step)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "new-arm") {
    const branch = findStructure(next, placement.branchId)
    if (!branch || branch.type !== "branch") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    const arm = { expr: "(state) => true", steps: [step] }
    const defaultIndex = branch.branches.findIndex((entry) => entry.expr === undefined)
    if (defaultIndex >= 0) branch.branches.splice(defaultIndex, 0, arm)
    else branch.branches.push(arm)
    const finalized = finalizeManifest(next)
    if (!finalized.ok) return finalized
    return { ok: true, manifest: finalized.manifest, stepId: step.id }
  }

  if (placement.kind === "new-line") {
    const parallel = findStructure(next, placement.parallelId)
    if (!parallel || parallel.type !== "parallel") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
    parallel.branches.push([step])
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
