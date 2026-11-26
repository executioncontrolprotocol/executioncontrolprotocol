import type { ReactFlowLoopItemsData, ReactFlowIoData, ReactFlowStepData } from "./types.js"

/** Height of synthetic structure `end` nodes in layout estimates. */
const STRUCTURE_END_HEIGHT = 32

/** Default React Flow node width (pixels) used by the layout. @category App */
export const DEFAULT_NODE_WIDTH = 260
/** Default node height (pixels) when a node has none. @category App */
export const DEFAULT_NODE_HEIGHT = 160
const PORT_ROW_ESTIMATE = 18
const HEADER_ESTIMATE = 72

/** Padding around parallel path frames (pixels). */
export const FRAME_PADDING = { x: 20, y: 16, label: 28 }

/**
 * Node shape accepted by bounds helpers (encoder and live canvas).
 * @category App
 */
export interface BoundsNode {
  /** React Flow node id. */
  id: string
  /** Current top-left in flow coordinates. */
  position: { x: number; y: number }
  /** Optional width from layout. */
  style?: { width?: unknown; height?: unknown }
  /** Node kind for height estimate. */
  type?: string
  /** Node payload (ports used for height estimate when present). */
  data?: unknown
}

/**
 * Axis-aligned rectangle in flow coordinates.
 * @category App
 */
export interface FrameRect {
  /** Left. */
  x: number
  /** Top. */
  y: number
  /** Width. */
  width: number
  /** Height. */
  height: number
}

/**
 * Frame membership used to compute bounds after layout or drag.
 * @category App
 */
export interface FrameMembership {
  /** Frame node id. */
  frameId: string
  /** Body node ids, including loop heads. */
  memberNodeIds: readonly string[]
  /** Nested frame ids. */
  childFrameIds: readonly string[]
  /** Nesting depth. */
  depth: number
}

/**
 * Union of two axis-aligned rectangles.
 * @category App
 */
export function unionRect(a: FrameRect, b: FrameRect): FrameRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: x2 - x, height: y2 - y }
}

function estimateNodeHeight(node: BoundsNode, fallback: number): number {
  if (node.type === "ecp-end") return STRUCTURE_END_HEIGHT
  if (node.type === "ecp-placeholder") return 1
  if (node.type === "ecp-tunnel") return fallback
  const data = node.data as
    | ReactFlowStepData
    | ReactFlowIoData
    | ReactFlowLoopItemsData
    | { inputs: unknown[]; outputs: unknown[] }
    | undefined
  if (!data || !("inputs" in data) || !("outputs" in data)) return fallback
  const rows =
    node.type === "ecp-step" || node.type === "ecp-loop"
      ? Math.max(data.inputs.length, 1) + Math.max(data.outputs.length, 1)
      : Math.max(data.inputs.length + data.outputs.length, 1)
  return Math.max(fallback, HEADER_ESTIMATE + rows * PORT_ROW_ESTIMATE)
}

/**
 * Axis-aligned bounds of the given step nodes after layout.
 * @category App
 */
export function boundsAroundNodeIds(
  nodes: readonly BoundsNode[],
  nodeIds: readonly string[],
  nodeWidth: number,
  defaultNodeHeight: number,
): FrameRect | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (const id of nodeIds) {
    const node = byId.get(id)
    if (!node) continue
    any = true
    const rawWidth = node.style?.width
    const width = typeof rawWidth === "number" && Number.isFinite(rawWidth) ? rawWidth : nodeWidth
    const height = estimateNodeHeight(node, defaultNodeHeight)
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  }
  if (!any) return undefined
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Compute frame rectangles from member nodes and nested frames (deepest first).
 * @category App
 */
export function frameBounds(
  nodes: readonly BoundsNode[],
  frames: readonly FrameMembership[],
  options?: { nodeWidth?: number; nodeHeight?: number; headerless?: boolean },
): Map<string, FrameRect> {
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const rects = new Map<string, FrameRect>()
  const byDepth = [...frames].sort((a, b) => b.depth - a.depth)

  for (const spec of byDepth) {
    let inner = boundsAroundNodeIds(nodes, spec.memberNodeIds, nodeWidth, nodeHeight)
    for (const childId of spec.childFrameIds) {
      const child = rects.get(childId)
      if (!child) continue
      inner = inner ? unionRect(inner, child) : child
    }
    if (!inner) continue
    const pad = FRAME_PADDING
    const labelGap = options?.headerless ? 0 : pad.label
    rects.set(spec.frameId, {
      x: inner.x - pad.x,
      y: inner.y - pad.y - labelGap,
      width: inner.width + pad.x * 2,
      height: inner.height + pad.y * 2 + labelGap,
    })
  }
  return rects
}

