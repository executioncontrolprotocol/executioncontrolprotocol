import { frameBounds, type FrameMembership, type FrameRect } from "./layout.js"
import type { ReactFlowDocument, ReactFlowFrameData, ReactFlowNode } from "./types.js"

/** Browser storage key prefix for canvas position overrides. */
export const POSITION_STORAGE_PREFIX = "ecp.app.positions.v1"

/**
 * Flow position stored outside the manifest.
 * @category App
 */
export interface NodePosition {
  /** X in flow coordinates. */
  x: number
  /** Y in flow coordinates. */
  y: number
}

/**
 * Map of node id to dragged position.
 * @category App
 */
export type PositionOverrides = Record<string, NodePosition>

/**
 * localStorage key for overrides of a given execution source.
 * @category App
 */
export function positionStorageKey(source: { kind: "path"; path: string } | { kind: "id"; id: string }): string {
  return source.kind === "path"
    ? `${POSITION_STORAGE_PREFIX}:path:${source.path}`
    : `${POSITION_STORAGE_PREFIX}:id:${source.id}`
}

function isFinitePosition(value: unknown): value is NodePosition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as { x?: unknown; y?: unknown }
  return typeof record.x === "number" && Number.isFinite(record.x) && typeof record.y === "number" && Number.isFinite(record.y)
}

/**
 * Parse overrides from localStorage JSON. Malformed payloads yield `{}`.
 * @category App
 */
export function parsePositionOverrides(raw: string | null): PositionOverrides {
  if (raw === null || raw === "") return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  const entries = Object.entries(parsed as Record<string, unknown>)
  const out: PositionOverrides = {}
  for (const [id, value] of entries) {
    if (!isFinitePosition(value)) return {}
    out[id] = { x: value.x, y: value.y }
  }
  return out
}

function frameMemberships(nodes: readonly ReactFlowNode[]): FrameMembership[] {
  const out: FrameMembership[] = []
  for (const node of nodes) {
    if (node.type !== "ecp-frame") continue
    const data = node.data as ReactFlowFrameData
    out.push({
      frameId: node.id,
      memberNodeIds: data.memberNodeIds,
      childFrameIds: data.childFrameIds,
      depth: data.depth,
    })
  }
  return out
}

function applyFrameRects(nodes: readonly ReactFlowNode[], rects: Map<string, FrameRect>): ReactFlowNode[] {
  return nodes.map((node) => {
    if (node.type !== "ecp-frame") return node
    const rect = rects.get(node.id)
    if (!rect) return node
    return {
      ...node,
      position: { x: rect.x, y: rect.y },
      style: {
        ...node.style,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      },
    }
  })
}

/**
 * Apply dagre layout, then override positions and rebuild frame bounds.
 * @category App
 */
export function placeWithOverrides(document: ReactFlowDocument, overrides: PositionOverrides): ReactFlowDocument {
  const positioned = document.nodes.map((node): ReactFlowNode => {
    if (node.type === "ecp-frame") return node
    const override = overrides[node.id]
    if (!override) return node
    return { ...node, position: { x: override.x, y: override.y } }
  })
  const frames = frameMemberships(positioned)
  const rects = frameBounds(positioned, frames)
  const nodes = applyFrameRects(positioned, rects)
  return { ...document, nodes }
}

/**
 * Drop stale override ids when the document changes.
 * @category App
 */
export function prunePositionOverrides(
  overrides: PositionOverrides,
  previousIds: ReadonlySet<string>,
  nextIds: ReadonlySet<string>,
  frameIds: ReadonlySet<string>,
): PositionOverrides {
  const next: PositionOverrides = {}
  for (const [id, position] of Object.entries(overrides)) {
    if (frameIds.has(id)) continue
    if (previousIds.has(id) && !nextIds.has(id)) continue
    next[id] = position
  }
  return next
}

/**
 * Hash of dagre node positions used to refit the viewport on structural relayout.
 * @category App
 */
export function reactFlowLayoutFitKey(document: ReactFlowDocument): string {
  return document.nodes
    .map(
      (node) =>
        `${node.id}:${node.position.x}:${node.position.y}:${String(node.style?.width ?? "")}:${String(node.style?.height ?? "")}`,
    )
    .join("|")
}