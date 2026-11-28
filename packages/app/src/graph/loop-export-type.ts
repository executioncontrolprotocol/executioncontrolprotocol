import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { findNodePlacement } from "./manifest-walk.js"

/**
 * Count loops in the ancestor chain from `stepId` up to (but not including) the manifest root list.
 * @category App
 */
export function loopDepthForStep(manifest: ExecutionManifest, stepId: string): number {
  const hit = findNodePlacement(manifest.steps, stepId)
  if (!hit) return 0
  let depth = 0
  let list = hit.parent
  while (list !== manifest.steps) {
    const parentId = listParentStepId(manifest.steps, list)
    if (!parentId) break
    const parent = findNodePlacement(manifest.steps, parentId)
    if (!parent) break
    if (parent.node.type === "loop") depth += 1
    list = parent.parent
  }
  return depth
}

function listParentStepId(root: ExecutionManifest["steps"], target: typeof root): string | undefined {
  for (const node of root) {
    if (node.type === "if") {
      if (node.then === target) return node.id
      if (node.else === target) return node.id
    } else if (node.type === "parallel") {
      for (const path of node.paths) if (path === target) return node.id
    } else if (node.type === "loop") {
      if (node.steps === target) return node.id
    }
    const nested = nestedListParent(node, target)
    if (nested) return nested
  }
  return undefined
}

function nestedListParent(node: ExecutionManifest["steps"][number], target: ExecutionManifest["steps"]): string | undefined {
  if (node.type === "if") {
    const t = listParentStepId(node.then, target)
    if (t) return node.id
    if (node.else) {
      const e = listParentStepId(node.else, target)
      if (e) return node.id
    }
  } else if (node.type === "parallel") {
    for (const path of node.paths) {
      const p = listParentStepId(path, target)
      if (p) return node.id
    }
  } else if (node.type === "loop") {
    const b = listParentStepId(node.steps, target)
    if (b) return node.id
  }
  return undefined
}

/**
 * Count loops strictly between the reader and writer placements (loops that wrap the reader but not the writer).
 * @category App
 */
export function loopsCrossedBetween(
  manifest: ExecutionManifest,
  readerStepId: string,
  writerStepId: string,
): number {
  const readerDepth = loopDepthForStep(manifest, readerStepId)
  const writerDepth = loopDepthForStep(manifest, writerStepId)
  return Math.max(0, writerDepth - readerDepth)
}

/**
 * Append `[]` per loop the value crosses when leaving a loop body toward a reader outside fewer loops.
 * @category App
 */
export function typeLabelCrossingLoops(baseTypeLabel: string, loopsCrossed: number): string {
  if (loopsCrossed <= 0) return baseTypeLabel
  return `${baseTypeLabel}${"[]".repeat(loopsCrossed)}`
}