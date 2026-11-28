import { resizeTunnelNodes } from "./tunnel-geometry.js"
import { parseEndMarkerId } from "./types.js"
import type { ReactFlowDocument, ReactFlowNode } from "./types.js"

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

/**
 * Apply overrides, then rebuild tunnel bounds from member node positions.
 * @category App
 */
export function placeWithOverrides(document: ReactFlowDocument, overrides: PositionOverrides): ReactFlowDocument {
  const positioned = document.nodes.map((node): ReactFlowNode => {
    if (node.type === "ecp-tunnel" || node.type === "ecp-end") return node
    const override = overrides[node.id]
    if (!override) return node
    return { ...node, position: { x: override.x, y: override.y } }
  })
  const nodes = resizeTunnelNodes(positioned)
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
  tunnelIds: ReadonlySet<string>,
): PositionOverrides {
  const next: PositionOverrides = {}
  for (const [id, position] of Object.entries(overrides)) {
    if (tunnelIds.has(id)) continue
    if (parseEndMarkerId(id)) continue
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