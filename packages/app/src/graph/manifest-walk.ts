import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
import { STRUCTURE_EDIT_EMPTY_STEPS, type StructureEditResult } from "./structure-edit.js"

/*
 * Shared, non-exported-from-index helpers for the pure manifest edit modules (structure-edit, connection-edit,
 * route-edit): locate nodes, clone, and apply the emptiness cleanup.
 */

/** Where a node sits: the list holding it and its index. */
export interface NodePlacement {
  parent: Node[]
  index: number
  node: Node
}

/** Where a step sits: the list holding it and its index. */
export interface StepPlacement {
  parent: Node[]
  index: number
}

/** @internal */
export function cloneManifest(manifest: ExecutionManifest): ExecutionManifest {
  return structuredClone(manifest)
}

/** @internal */
export function findNodePlacement(nodes: Node[], id: string): NodePlacement | undefined {
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

/** @internal */
export function findStepPlacement(nodes: Node[], stepId: string): StepPlacement | undefined {
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

/** @internal */
export function cleanNodes(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const node of nodes) {
    const cleaned = cleanNode(node)
    if (cleaned === null) continue
    if (Array.isArray(cleaned)) out.push(...cleaned)
    else out.push(cleaned)
  }
  return out
}

/** @internal */
export function cleanNode(node: Node): Node | Node[] | null {
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

/** @internal */
export function finalizeManifest(manifest: ExecutionManifest): StructureEditResult {
  const steps = cleanNodes(manifest.steps)
  if (steps.length === 0) return { ok: false, reason: STRUCTURE_EDIT_EMPTY_STEPS }
  const detached = manifest.detached
  if (Array.isArray(detached) && detached.length === 0) {
    const rest = { ...manifest, steps }
    delete rest.detached
    return { ok: true, manifest: rest }
  }
  return { ok: true, manifest: { ...manifest, steps } }
}
