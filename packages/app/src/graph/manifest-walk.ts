import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode } from "@executioncontrolprotocol/protocol"
import { acceptsPropertyKeys, isStepNode } from "./io-from-schema.js"
import { STRUCTURE_EDIT_EMPTY_STEPS, type StructureEditResult } from "./structure-edit.js"

/*
 * Shared, non-exported-from-index helpers for the pure manifest edit modules (structure-edit, connection-edit):
 * locate nodes, clone, and apply the emptiness cleanup.
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

function walkChildren(node: Node, visit: (list: Node[]) => void): void {
  if (node.type === "if") {
    visit(node.then)
    if (node.else) visit(node.else)
  } else if (node.type === "parallel") {
    for (const path of node.paths) visit(path)
  } else if (node.type === "loop") {
    visit(node.steps)
  }
}

/** @internal */
export function findNodePlacement(nodes: Node[], id: string): NodePlacement | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (node.id === id) return { parent: nodes, index, node }
    let hit: NodePlacement | undefined
    walkChildren(node, (list) => {
      if (!hit) hit = findNodePlacement(list, id)
    })
    if (hit) return hit
  }
  return undefined
}

/** @internal */
export function findStepPlacement(nodes: Node[], stepId: string): StepPlacement | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!
    if (isStepNode(node) && node.id === stepId) return { parent: nodes, index }
    let hit: StepPlacement | undefined
    walkChildren(node, (list) => {
      if (!hit) hit = findStepPlacement(list, stepId)
    })
    if (hit) return hit
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
  if (node.type === "if") {
    const thenSteps = cleanNodes(node.then)
    const elseSteps = node.else ? cleanNodes(node.else) : undefined
    if (thenSteps.length === 0) return null
    return {
      ...node,
      then: thenSteps,
      ...(elseSteps && elseSteps.length > 0 ? { else: elseSteps } : {}),
    }
  }
  if (node.type === "parallel") {
    const paths = node.paths.map((path) => cleanNodes(path)).filter((path) => path.length > 0)
    if (paths.length === 0) return null
    if (paths.length === 1) return paths[0]!
    return { ...node, paths }
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

/** @internal */
export function isStructureNode(node: Node): node is IfNode | ParallelNode | LoopNode {
  return node.type === "if" || node.type === "parallel" || node.type === "loop"
}

/** @internal */
export function manifestDetached(manifest: ExecutionManifest): Node[] | undefined {
  const detached = manifest.detached
  return Array.isArray(detached) ? detached : undefined
}

/** @internal */
export function collectAllNodeIds(nodes: readonly Node[], out: Set<string>): void {
  for (const node of nodes) {
    out.add(node.id)
    if (isStepNode(node)) continue
    if (node.type === "if") {
      collectAllNodeIds(node.then, out)
      if (node.else) collectAllNodeIds(node.else, out)
    } else if (node.type === "parallel") {
      for (const path of node.paths) collectAllNodeIds(path, out)
    } else if (node.type === "loop") {
      collectAllNodeIds(node.steps, out)
    }
  }
}

/** @internal */
export function allNodeIds(manifest: ExecutionManifest): Set<string> {
  const ids = new Set<string>()
  collectAllNodeIds(manifest.steps, ids)
  const detached = manifestDetached(manifest)
  if (detached) collectAllNodeIds(detached, ids)
  return ids
}

/** @internal */
export function locateNode(manifest: ExecutionManifest, id: string): NodePlacement | undefined {
  const hit = findNodePlacement(manifest.steps, id)
  if (hit) return hit
  const detached = manifestDetached(manifest)
  return detached ? findNodePlacement(detached, id) : undefined
}

function collectStateKeys(nodes: readonly Node[], out: Set<string>): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      if (typeof node.as === "string") out.add(node.as)
      continue
    }
    if (typeof node.as === "string") out.add(node.as)
    if (node.type === "loop") {
      if (typeof node.as === "string" && node.mode === "forEach") out.add(`${node.as}Index`)
      if (typeof node.into === "string") out.add(node.into)
      collectStateKeys(node.steps, out)
    } else if (node.type === "if") {
      collectStateKeys(node.then, out)
      if (node.else) collectStateKeys(node.else, out)
    } else if (node.type === "parallel") {
      for (const path of node.paths) collectStateKeys(path, out)
    }
  }
}

/** Every state key already named in the manifest: step and structure `as`, loop `into` / `<as>Index`, execution inputs. @internal */
export function takenStateKeys(manifest: ExecutionManifest): Set<string> {
  const names = new Set<string>()
  collectStateKeys(manifest.steps, names)
  const detached = manifestDetached(manifest)
  if (detached) collectStateKeys(detached, names)
  for (const key of acceptsPropertyKeys(manifest)) names.add(key)
  return names
}

/** State key pattern from execution.base.schema.json: `^[A-Za-z_][A-Za-z0-9_]*$`. @internal */
export const STATE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** First name `stem`, `stem2`, `stem3`, … that no state key in the manifest uses. @internal */
export function freeStateKey(manifest: ExecutionManifest, stem: string): string {
  const taken = takenStateKeys(manifest)
  const base = STATE_KEY_PATTERN.test(stem) ? stem : `n_${stem.replace(/[^A-Za-z0-9_]/g, "_")}`
  let n = 1
  for (;;) {
    const candidate = n === 1 ? base : `${base}${n}`
    if (STATE_KEY_PATTERN.test(candidate) && !taken.has(candidate)) return candidate
    n += 1
  }
}

/** State key derived from a node id (`by-tier` becomes `by_tier`), unique in the manifest. @internal */
export function freeStateKeyForId(manifest: ExecutionManifest, nodeId: string): string {
  return freeStateKey(manifest, nodeId.replace(/-/g, "_"))
}

/** @internal */
export function nodeContainsId(root: Node, id: string): boolean {
  if (root.id === id) return true
  if (isStepNode(root)) return false
  if (root.type === "if") {
    for (const child of [...root.then, ...(root.else ?? [])]) {
      if (nodeContainsId(child, id)) return true
    }
  } else if (root.type === "parallel") {
    for (const path of root.paths) {
      for (const child of path) {
        if (nodeContainsId(child, id)) return true
      }
    }
  } else if (root.type === "loop") {
    for (const child of root.steps) {
      if (nodeContainsId(child, id)) return true
    }
  }
  return false
}
