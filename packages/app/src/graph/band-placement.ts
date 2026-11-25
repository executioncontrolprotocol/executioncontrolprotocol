import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { findStructure, type AddStepPlacement } from "./add-step.js"
import { boundsAroundNodeIds, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type FrameRect } from "./layout.js"
import { collectAllNodeIds } from "./manifest-walk.js"
import { loopEndNodeId, type ReactFlowDocument, type ReactFlowFrameBand, type ReactFlowFrameData } from "./types.js"

/**
 * Innermost container whose box holds `point` (flow coordinates), or `undefined` when the point is outside every
 * container.
 * @category App
 */
export function frameAtFlowPoint(
  document: ReactFlowDocument,
  point: { x: number; y: number },
): { frameId: string; data: ReactFlowFrameData } | undefined {
  let best: { frameId: string; data: ReactFlowFrameData } | undefined
  for (const node of document.nodes) {
    if (node.type !== "ecp-frame") continue
    const width = node.style?.width ?? 0
    const height = node.style?.height ?? 0
    const inside =
      point.x >= node.position.x &&
      point.y >= node.position.y &&
      point.x <= node.position.x + width &&
      point.y <= node.position.y + height
    if (!inside) continue
    const data = node.data as ReactFlowFrameData
    if (!best || data.depth >= best.data.depth) best = { frameId: node.id, data }
  }
  return best
}

function verticalDistance(box: FrameRect, y: number): number {
  if (y < box.y) return box.y - y
  if (y > box.y + box.height) return y - (box.y + box.height)
  return 0
}

function bandBox(document: ReactFlowDocument, band: ReactFlowFrameBand): FrameRect | undefined {
  return boundsAroundNodeIds(document.nodes, band.memberNodeIds, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
}

/** The band whose nodes sit nearest to `y`; the only band when there is one. */
function nearestBand(
  document: ReactFlowDocument,
  bands: readonly ReactFlowFrameBand[],
  y: number,
): ReactFlowFrameBand | undefined {
  let best: ReactFlowFrameBand | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const band of bands) {
    const box = bandBox(document, band)
    const distance = box ? verticalDistance(box, y) : Number.POSITIVE_INFINITY
    if (best === undefined || distance < bestDistance) {
      best = band
      bestDistance = distance
    }
  }
  return best
}

function subtreeNodeIds(node: Node): string[] {
  const ids = new Set<string>()
  collectAllNodeIds([node], ids)
  if (node.type === "loop") ids.add(loopEndNodeId(node.id))
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
 * Where a node added at `point` (flow coordinates) goes when the point lies inside a container: the band's list (`then`,
 * `else`, a path, the loop body) at the position nearest the cursor, measured along the band. `undefined` when the
 * point is outside every container, so the caller falls back to the top level.
 * @category App
 */
export function placementAtFlowPoint(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
): AddStepPlacement | undefined {
  const frame = frameAtFlowPoint(document, point)
  if (!frame) return undefined
  const structure = findStructure(manifest, frame.data.structureId)
  if (!structure) return undefined
  const band = nearestBand(document, frame.data.bands, point.y)

  let children: Node[]
  let atStart: AddStepPlacement
  if (structure.type === "if") {
    const side = band?.label === "else" && structure.else ? "else" : "then"
    children = side === "else" ? (structure.else ?? []) : structure.then
    atStart = side === "else" ? { kind: "else-side", ifId: structure.id } : { kind: "then-side", ifId: structure.id }
  } else if (structure.type === "parallel") {
    const parsed = band ? Number.parseInt(band.label.replace(/^path\s+/, ""), 10) - 1 : 0
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
