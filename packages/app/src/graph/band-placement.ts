import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { findStructure, type AddStepPlacement } from "./add-step.js"
import { boundsAroundNodeIds, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./layout.js"
import { collectAllNodeIds } from "./manifest-walk.js"
import { structureEndNodeId, type ReactFlowDocument, type ReactFlowTunnelData } from "./types.js"

/**
 * Innermost tunnel whose box holds `point` (flow coordinates), or `undefined` when the point is outside every tunnel.
 * @category App
 */
export function tunnelAtFlowPoint(
  document: ReactFlowDocument,
  point: { x: number; y: number },
): { tunnelId: string; data: ReactFlowTunnelData } | undefined {
  let best: { tunnelId: string; data: ReactFlowTunnelData } | undefined
  for (const node of document.nodes) {
    if (node.type !== "ecp-tunnel") continue
    const width = node.style?.width ?? 0
    const height = node.style?.height ?? 0
    const inside =
      point.x >= node.position.x &&
      point.y >= node.position.y &&
      point.x <= node.position.x + width &&
      point.y <= node.position.y + height
    if (!inside) continue
    const data = node.data as ReactFlowTunnelData
    if (!best || data.depth >= best.data.depth) best = { tunnelId: node.id, data }
  }
  return best
}

/**
 * @deprecated Use {@link tunnelAtFlowPoint}.
 * @category App
 */
export function frameAtFlowPoint(
  document: ReactFlowDocument,
  point: { x: number; y: number },
): { frameId: string; data: ReactFlowTunnelData } | undefined {
  const hit = tunnelAtFlowPoint(document, point)
  if (!hit) return undefined
  return { frameId: hit.tunnelId, data: hit.data }
}

function subtreeNodeIds(node: Node): string[] {
  const ids = new Set<string>()
  collectAllNodeIds([node], ids)
  if (node.type === "if" || node.type === "parallel" || node.type === "loop") {
    ids.add(structureEndNodeId(node.id))
  }
  return [...ids]
}

/** Index in `children` where a node dropped at `x` goes: before the first child whose centre is right of `x`. */
function insertIndexAtX(document: ReactFlowDocument, children: readonly Node[], x: number): number {
  for (let index = 0; index < children.length; index += 1) {
    const box = boundsAroundNodeIds(document.nodes, subtreeNodeIds(children[index]!), DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    if (box && box.x + box.width / 2 > x) return index
  }
  return children.length
}

/**
 * Where a node added at `point` (flow coordinates) goes when the point lies inside a tunnel. `undefined` when the
 * point is outside every tunnel, so the caller falls back to the top level.
 * @category App
 */
export function placementAtFlowPoint(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
): AddStepPlacement | undefined {
  const tunnel = tunnelAtFlowPoint(document, point)
  if (!tunnel) return undefined
  const structure = findStructure(manifest, tunnel.data.structureId)
  if (!structure) return undefined

  let children: Node[]
  let atStart: AddStepPlacement
  if (structure.type === "if") {
    const side = tunnel.data.tunnelKind === "else" && structure.else ? "else" : "then"
    children = side === "else" ? (structure.else ?? []) : structure.then
    atStart = side === "else" ? { kind: "else-side", ifId: structure.id } : { kind: "then-side", ifId: structure.id }
  } else if (structure.type === "parallel") {
    const parsed = Number.parseInt(tunnel.data.label.replace(/^path\s+/, ""), 10) - 1
    const pathIndex = Number.isInteger(parsed) && parsed >= 0 && parsed < structure.paths.length ? parsed : 0
    children = structure.paths[pathIndex] ?? []
    atStart = { kind: "path-side", parallelId: structure.id, pathIndex }
  } else {
    children = structure.steps
    atStart = { kind: "loop-body", loopId: structure.id }
  }

  const index = insertIndexAtX(document, children, point.x)
  if (index === 0) return atStart
  return { kind: "after", nodeId: children[index - 1]!.id }
}