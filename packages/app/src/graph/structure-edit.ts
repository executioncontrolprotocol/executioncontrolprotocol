import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode } from "@executioncontrolprotocol/protocol"
import {
  cloneManifest,
  finalizeManifest,
  findNodePlacement,
  findStepPlacement,
  freeStateKey,
  locateNode,
  type NodePlacement,
  allNodeIds,
  isStructureNode,
} from "./manifest-walk.js"
/**
 * Outcome of a manifest structure edit.
 * @category App
 */
export type StructureEditResult =
  | { ok: true; manifest: ExecutionManifest }
  | { ok: false; reason: string }

/** @category App */
export const STRUCTURE_EDIT_CONTIGUOUS = "Select contiguous nodes in the same list"

/** @category App */
export const STRUCTURE_EDIT_PARALLEL_MIN = "Select two or more nodes, one per path"

/** @category App */
export const STRUCTURE_EDIT_EMPTY_STEPS = "The execution must keep at least one step"

/** @category App */
export const STRUCTURE_EDIT_STEP_NOT_FOUND = "Step not found"

/** @category App */
export const STRUCTURE_EDIT_STRUCTURE_NOT_FOUND = "Structure not found"

function nextStructureId(prefix: "if" | "parallel" | "loop", taken: Set<string>): string {
  let n = 1
  while (taken.has(`${prefix}-${n}`)) n += 1
  return `${prefix}-${n}`
}

function structureBody(node: Node): Node[] {
  if (node.type === "if") {
    const out = [...node.then]
    if (node.else) out.push(...node.else)
    return out
  }
  if (node.type === "parallel") return node.paths.flat()
  if (node.type === "loop") return [...node.steps]
  return []
}

/**
 * Step ids to wrap: the multi-selection when the right-clicked step is in it, else that step alone.
 * @category App
 */
export function wrapSelectionIds(selectedStepIds: readonly string[], rightClickedId: string): string[] {
  if (selectedStepIds.includes(rightClickedId)) return [...selectedStepIds]
  return [rightClickedId]
}

/**
 * Wrap contiguous sibling nodes (steps or start nodes) in a new `if`, `parallel` (one path per node), or `for` loop.
 * @category App
 */
export function wrapSteps(
  manifest: ExecutionManifest,
  stepIds: readonly string[],
  kind: "if" | "parallel" | "loop",
): StructureEditResult {
  if (stepIds.length === 0) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const unique = [...new Set(stepIds)]
  if (unique.length !== stepIds.length) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }

  const placements: NodePlacement[] = []
  for (const stepId of unique) {
    const hit = findNodePlacement(manifest.steps, stepId)
    if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
    placements.push(hit)
  }

  const parent = placements[0]!.parent
  if (!placements.every((p) => p.parent === parent)) {
    return { ok: false, reason: STRUCTURE_EDIT_CONTIGUOUS }
  }

  const indexes = placements.map((p) => p.index).sort((a, b) => a - b)
  for (let i = 0; i < indexes.length; i += 1) {
    if (indexes[i] !== indexes[0]! + i) return { ok: false, reason: STRUCTURE_EDIT_CONTIGUOUS }
  }

  if (kind === "parallel" && unique.length < 2) {
    return { ok: false, reason: STRUCTURE_EDIT_PARALLEL_MIN }
  }

  const next = cloneManifest(manifest)
  const nextPlacements: NodePlacement[] = []
  for (const stepId of unique) {
    const hit = findNodePlacement(next.steps, stepId)
    if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
    nextPlacements.push(hit)
  }
  const parentList = nextPlacements[0]!.parent
  const nextIndexes = nextPlacements.map((p) => p.index).sort((a, b) => a - b)

  const taken = allNodeIds(next)
  const slice = parentList.splice(nextIndexes[0]!, nextIndexes.length)
  let inserted: Node

  if (kind === "if") {
    const id = nextStructureId("if", taken)
    inserted = {
      type: "if",
      id,
      expression: "true",
      then: slice,
    } satisfies IfNode
  } else if (kind === "parallel") {
    const id = nextStructureId("parallel", taken)
    inserted = {
      type: "parallel",
      id,
      paths: slice.map((node) => [node]),
    } satisfies ParallelNode
  } else {
    const id = nextStructureId("loop", taken)
    const as = freeStateKey(next, "i")
    inserted = {
      type: "loop",
      id,
      mode: "for",
      as,
      input: { count: LOOP_DEFAULT_COUNT },
      steps: slice,
    } satisfies LoopNode
  }

  parentList.splice(nextIndexes[0]!, 0, inserted)
  return finalizeManifest(next)
}

/**
 * Replace a structure with its body steps in document order.
 * @category App
 */
export function unwrapStructure(manifest: ExecutionManifest, structureId: string): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = findNodePlacement(next.steps, structureId)
  if (!hit || !isStructureNode(hit.node)) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  const body = structureBody(hit.node)
  if (body.length === 0) return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  hit.parent.splice(hit.index, 1, ...body)
  return finalizeManifest(next)
}

/**
 * Remove a structure and everything inside it, then apply the emptiness cascade.
 * @category App
 */
export function removeStructure(manifest: ExecutionManifest, structureId: string): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = findNodePlacement(next.steps, structureId)
  if (!hit || !isStructureNode(hit.node)) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  hit.parent.splice(hit.index, 1)
  return finalizeManifest(next)
}

/**
 * Loop modes and the fields each mode uses. Changing the mode removes the fields the new mode forbids.
 * @category App
 */
export type LoopMode = "for" | "forEach"

/** Loop fields (besides `mode`) that only some modes allow. */
const LOOP_FIELD_MODES: Readonly<Record<string, readonly LoopMode[]>> = {
  as: ["for", "forEach"],
  concurrency: ["forEach"],
  onError: ["forEach"],
}

/** Placeholder `count` for a loop switched to `for`: one iteration, so the loop validates until the user binds a count. */
const LOOP_DEFAULT_COUNT = 1

/**
 * Switch a loop to `mode`, rewriting only what the new mode needs and removing what it forbids so the result validates
 * when it can.
 * @category App
 */
export function setLoopMode(manifest: ExecutionManifest, loopId: string, mode: LoopMode): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = locateNode(next, loopId)
  if (!hit || hit.node.type !== "loop") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  const loop = hit.node
  if (mode !== "for" && mode !== "forEach") return { ok: false, reason: "Invalid loop field" }
  const input: Record<string, unknown> = { ...(loop.input ?? {}) }
  if (mode === "for") {
    delete loop.concurrency
    delete loop.onError
    delete input.items
    input.count ??= LOOP_DEFAULT_COUNT
    loop.as ??= freeStateKey(next, "i")
  } else {
    delete input.count
    loop.as ??= freeStateKey(next, "item")
  }
  loop.input = input as LoopNode["input"]
  loop.mode = mode
  return { ok: true, manifest: next }
}

/** Update a scalar field on a loop node (canvas panel). The `mode` field delegates to {@link setLoopMode}. @category App */
export function setLoopField(
  manifest: ExecutionManifest,
  loopId: string,
  field: string,
  value: unknown,
): StructureEditResult {
  if (field === "mode") {
    if (value === "for" || value === "forEach") return setLoopMode(manifest, loopId, value)
    return { ok: false, reason: "Invalid loop field" }
  }
  const next = cloneManifest(manifest)
  const hit = findNodePlacement(next.steps, loopId)
  if (!hit || hit.node.type !== "loop") return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  const loop = hit.node
  const mode = loop.mode
  const allowed = LOOP_FIELD_MODES[field]
  if (allowed && !allowed.includes(mode)) return { ok: false, reason: `${field} is not used by ${mode} loops` }
  if (field === "concurrency" && typeof value === "number") loop.concurrency = value
  else if (field === "onError" && (value === "fail" || value === "continue")) loop.onError = value
  else if (field === "as" && typeof value === "string") loop.as = value
  else return { ok: false, reason: "Invalid loop field" }
  return finalizeManifest(next)
}

/**
 * Remove one step and apply the emptiness cascade.
 * @category App
 */
export function deleteStep(manifest: ExecutionManifest, stepId: string): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = findStepPlacement(next.steps, stepId)
  if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  hit.parent.splice(hit.index, 1)
  return finalizeManifest(next)
}
