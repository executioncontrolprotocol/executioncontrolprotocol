import type {
  BranchNode,
  ExecutionManifest,
  LoopNode,
  Node,
  ParallelNode,
  StepNode,
} from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"

/**
 * Outcome of a manifest structure edit.
 * @category App
 */
export type StructureEditResult =
  | { ok: true; manifest: ExecutionManifest }
  | { ok: false; reason: string }

/** @category App */
export const STRUCTURE_EDIT_CONTIGUOUS = "Select contiguous steps in the same container"

/** @category App */
export const STRUCTURE_EDIT_PARALLEL_MIN = "Select two or more steps"

/** @category App */
export const STRUCTURE_EDIT_EMPTY_STEPS = "The execution must keep at least one step"

/** @category App */
export const STRUCTURE_EDIT_STEP_NOT_FOUND = "Step not found"

/** @category App */
export const STRUCTURE_EDIT_STRUCTURE_NOT_FOUND = "Structure not found"

interface NodePlacement {
  /** List that directly holds the node. */
  parent: Node[]
  /** Index in `parent`. */
  index: number
  node: Node
}

interface StepPlacement {
  parent: Node[]
  index: number
}

function cloneManifest(manifest: ExecutionManifest): ExecutionManifest {
  return structuredClone(manifest)
}

function manifestDetachedSteps(manifest: ExecutionManifest): Node[] | undefined {
  const detached = (manifest as ExecutionManifest & { detached?: Node[] }).detached
  return Array.isArray(detached) ? detached : undefined
}

function collectAllNodeIds(nodes: readonly Node[], out: Set<string>): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      out.add(node.id)
      continue
    }
    out.add(node.id)
    if (node.type === "branch") {
      for (const arm of node.branches) collectAllNodeIds(arm.steps, out)
    } else if (node.type === "parallel") {
      for (const line of node.branches) collectAllNodeIds(line, out)
    } else if (node.type === "loop") {
      collectAllNodeIds(node.steps, out)
    }
  }
}

function allIdsInManifest(manifest: ExecutionManifest): Set<string> {
  const ids = new Set<string>()
  collectAllNodeIds(manifest.steps, ids)
  const detached = manifestDetachedSteps(manifest)
  if (detached) collectAllNodeIds(detached, ids)
  return ids
}

function nextStructureId(prefix: "branch" | "parallel" | "loop", taken: Set<string>): string {
  let n = 1
  while (taken.has(`${prefix}-${n}`)) n += 1
  return `${prefix}-${n}`
}

function findNodePlacement(nodes: Node[], id: string): NodePlacement | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.id === id) return { parent: nodes, index, node }
    if (node.type === "branch") {
      for (const arm of node.branches) {
        const hit = findNodePlacement(arm.steps, id)
        if (hit) return hit
      }
    } else if (node.type === "parallel") {
      for (const line of node.branches) {
        const hit = findNodePlacement(line, id)
        if (hit) return hit
      }
    } else if (node.type === "loop") {
      const hit = findNodePlacement(node.steps, id)
      if (hit) return hit
    }
  }
  return undefined
}

function findStepPlacement(nodes: Node[], stepId: string): StepPlacement | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (isStepNode(node) && node.id === stepId) return { parent: nodes, index }
    if (node.type === "branch") {
      for (const arm of node.branches) {
        const hit = findStepPlacement(arm.steps, stepId)
        if (hit) return hit
      }
    } else if (node.type === "parallel") {
      for (const line of node.branches) {
        const hit = findStepPlacement(line, stepId)
        if (hit) return hit
      }
    } else if (node.type === "loop") {
      const hit = findStepPlacement(node.steps, stepId)
      if (hit) return hit
    }
  }
  return undefined
}

function cleanNodes(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const node of nodes) {
    const cleaned = cleanNode(node)
    if (cleaned === null) continue
    if (Array.isArray(cleaned)) out.push(...cleaned)
    else out.push(cleaned)
  }
  return out
}

function cleanNode(node: Node): Node | Node[] | null {
  if (isStepNode(node)) return node
  if (node.type === "branch") {
    const branches = node.branches
      .map((arm) => ({ ...arm, steps: cleanNodes(arm.steps) }))
      .filter((arm) => arm.steps.length > 0)
    if (branches.length === 0) return null
    return { ...node, branches }
  }
  if (node.type === "parallel") {
    const branches = node.branches.map((line) => cleanNodes(line)).filter((line) => line.length > 0)
    if (branches.length === 0) return null
    if (branches.length === 1) return branches[0]!
    return { ...node, branches }
  }
  if (node.type === "loop") {
    const steps = cleanNodes(node.steps)
    if (steps.length === 0) return null
    return { ...node, steps }
  }
  return node
}

function finalizeManifest(manifest: ExecutionManifest): StructureEditResult {
  const steps = cleanNodes(manifest.steps)
  if (steps.length === 0) return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  return { ok: true, manifest: { ...manifest, steps } }
}

function structureBody(node: Node): Node[] {
  if (node.type === "branch") return node.branches.flatMap((arm) => arm.steps)
  if (node.type === "parallel") return node.branches.flatMap((line) => line)
  if (node.type === "loop") return [...node.steps]
  return []
}

function isStructureNode(node: Node): node is BranchNode | ParallelNode | LoopNode {
  return node.type === "branch" || node.type === "parallel" || node.type === "loop"
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
 * Wrap contiguous sibling steps in a new branch, parallel, or `while` loop.
 * @category App
 */
export function wrapSteps(
  manifest: ExecutionManifest,
  stepIds: readonly string[],
  kind: "branch" | "parallel" | "loop",
): StructureEditResult {
  if (stepIds.length === 0) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
  const unique = [...new Set(stepIds)]
  if (unique.length !== stepIds.length) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }

  const placements: StepPlacement[] = []
  for (const stepId of unique) {
    const hit = findStepPlacement(manifest.steps, stepId)
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
  const nextPlacements: StepPlacement[] = []
  for (const stepId of unique) {
    const hit = findStepPlacement(next.steps, stepId)
    if (!hit) return { ok: false, reason: STRUCTURE_EDIT_STEP_NOT_FOUND }
    nextPlacements.push(hit)
  }
  const parentList = nextPlacements[0]!.parent
  const nextIndexes = nextPlacements.map((p) => p.index).sort((a, b) => a - b)

  const taken = allIdsInManifest(next)
  const slice = parentList.splice(nextIndexes[0]!, nextIndexes.length)
  let inserted: Node

  if (kind === "branch") {
    const id = nextStructureId("branch", taken)
    inserted = {
      type: "branch",
      id,
      branches: [{ label: "condition", expr: "(state) => true", steps: slice as StepNode[] }],
    } satisfies BranchNode
  } else if (kind === "parallel") {
    const id = nextStructureId("parallel", taken)
    inserted = {
      type: "parallel",
      id,
      branches: (slice as StepNode[]).map((step) => [step]),
    } satisfies ParallelNode
  } else {
    const id = nextStructureId("loop", taken)
    inserted = {
      type: "loop",
      id,
      mode: "while",
      expr: "(state) => true",
      maxRounds: 1,
      steps: slice as StepNode[],
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