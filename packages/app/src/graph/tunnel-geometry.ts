import {
  boundsAroundNodeIds,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type BoundsNode,
  type FrameRect,
} from "./layout.js"
import type { ReactFlowEncodeOptions, ReactFlowNode, ReactFlowTunnelData, ReactFlowTunnelKind } from "./types.js"

/** Padding around tunnel bounds (pixels). */
export const TUNNEL_PADDING = { x: 20, y: 20, label: 22 }

/**
 * Axis-aligned box for one laid-out node.
 * @category App
 */
export function nodeBox(
  node: BoundsNode,
  nodeWidth = DEFAULT_NODE_WIDTH,
  defaultNodeHeight = DEFAULT_NODE_HEIGHT,
): FrameRect {
  const rawWidth = node.style?.width
  const width = typeof rawWidth === "number" && Number.isFinite(rawWidth) ? rawWidth : nodeWidth
  const rawHeight = node.style?.height
  let height = defaultNodeHeight
  if (typeof rawHeight === "number" && Number.isFinite(rawHeight)) height = rawHeight
  else if (node.type === "ecp-end") height = 32
  else if (node.type === "ecp-placeholder") height = 1
  return { x: node.position.x, y: node.position.y, width, height }
}

/**
 * Horizontal centre of a node's layout box.
 * @category App
 */
export function nodeCenterX(node: BoundsNode, nodeWidth = DEFAULT_NODE_WIDTH): number {
  const box = nodeBox(node, nodeWidth)
  return box.x + box.width / 2
}

/**
 * True when two rectangles overlap (positive area).
 * @category App
 */
export function rectsIntersect(a: FrameRect, b: FrameRect, tolerance = 0): boolean {
  return !(
    a.x + a.width <= b.x + tolerance ||
    b.x + b.width <= a.x + tolerance ||
    a.y + a.height <= b.y + tolerance ||
    b.y + b.height <= a.y + tolerance
  )
}

/**
 * True when `inner` lies entirely inside `outer`.
 * @category App
 */
export function rectContainsRect(outer: FrameRect, inner: FrameRect, tolerance = 1): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

/**
 * Axis-aligned bounds for one tunnel's member nodes, with padding and a label band.
 * @category App
 */
export function tunnelBounds(
  nodes: readonly ReactFlowNode[],
  memberNodeIds: readonly string[],
  options?: ReactFlowEncodeOptions,
): FrameRect | undefined {
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const inner = boundsAroundNodeIds(nodes, memberNodeIds, nodeWidth, nodeHeight)
  if (!inner) return undefined
  const pad = TUNNEL_PADDING
  return {
    x: inner.x - pad.x,
    y: inner.y - pad.y - pad.label,
    width: inner.width + pad.x * 2,
    height: inner.height + pad.y * 2 + pad.label,
  }
}

export interface TunnelRectInput {
  /** Which branch or body this tunnel outlines. */
  tunnelKind: ReactFlowTunnelKind
  /** Control structure node id. */
  controlNodeId: string
  /** Synthetic `end:<structureId>` node. */
  endNodeId: string
  /** Nodes on this side only (or loop body step ids). */
  sideNodeIds: readonly string[]
  /** Nested tunnel ids for vertical bounds union on side tubes. */
  childTunnelIds?: readonly string[]
}

/**
 * Tunnel rectangle from layout positions: side tubes span control centre to `end` centre; loop boxes wrap control, body
 * and `end`.
 * @category App
 */
export function computeTunnelRect(
  nodes: readonly BoundsNode[],
  spec: TunnelRectInput,
  childRects: ReadonlyMap<string, FrameRect>,
  options?: ReactFlowEncodeOptions,
): FrameRect | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const pad = TUNNEL_PADDING
  const control = byId.get(spec.controlNodeId)
  const end = byId.get(spec.endNodeId)
  if (!control || !end) return undefined

  let inner = boundsAroundNodeIds(nodes, spec.sideNodeIds, nodeWidth, nodeHeight)
  if (!inner && spec.sideNodeIds.length === 0) return undefined
  if (!inner) {
    inner = {
      x: control.position.x,
      y: control.position.y,
      width: nodeWidth,
      height: nodeHeight,
    }
  }
  if (spec.tunnelKind === "rail" || spec.tunnelKind === "join") {
    const railInner = boundsAroundNodeIds(nodes, spec.sideNodeIds, nodeWidth, nodeHeight)
    if (railInner) return railInner
    return undefined
  }

  if (spec.tunnelKind === "loop") {
    const loopInner = boundsAroundNodeIds(
      nodes,
      [spec.controlNodeId, spec.endNodeId, ...spec.sideNodeIds],
      nodeWidth,
      nodeHeight,
    )
    if (loopInner) inner = loopInner
    for (const childId of spec.childTunnelIds ?? []) {
      const child = childRects.get(childId)
      if (!child) continue
      const x = Math.min(inner.x, child.x)
      const y = Math.min(inner.y, child.y)
      const x2 = Math.max(inner.x + inner.width, child.x + child.width)
      const y2 = Math.max(inner.y + inner.height, child.y + child.height)
      inner = { x, y, width: x2 - x, height: y2 - y }
    }
    return {
      x: inner.x - pad.x,
      y: inner.y - pad.y - pad.label,
      width: inner.width + pad.x * 2,
      height: inner.height + pad.y * 2 + pad.label,
    }
  }

  const cx = nodeCenterX(control, nodeWidth)
  const ex = nodeCenterX(end, nodeWidth)
  const left = Math.min(cx, ex) - pad.x
  const right = Math.max(cx, ex) + pad.x
  return {
    x: left,
    y: inner.y - pad.y - pad.label,
    width: right - left,
    height: inner.height + pad.y * 2 + pad.label,
  }
}

function rectFromTunnelData(
  nodes: readonly ReactFlowNode[],
  data: ReactFlowTunnelData,
  childRects: ReadonlyMap<string, FrameRect>,
  options?: ReactFlowEncodeOptions,
): FrameRect | undefined {
  if (data.controlNodeId && data.endNodeId) {
    return computeTunnelRect(
      nodes,
      {
        tunnelKind: data.tunnelKind,
        controlNodeId: data.controlNodeId,
        endNodeId: data.endNodeId,
        sideNodeIds: data.sideNodeIds ?? data.memberNodeIds,
        childTunnelIds: data.childTunnelIds,
      },
      childRects,
      options,
    )
  }
  return tunnelBounds(nodes, data.memberNodeIds, options)
}

/**
 * Compute every tunnel rectangle deepest-first so nested tubes contribute to parent vertical bounds.
 * @category App
 */
export function computeAllTunnelRects(
  nodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): Map<string, FrameRect> {
  const tunnels = nodes.filter((node) => node.type === "ecp-tunnel")
  const byDepth = [...tunnels].sort((a, b) => {
    const da = (a.data as ReactFlowTunnelData).depth
    const db = (b.data as ReactFlowTunnelData).depth
    return db - da
  })
  const rects = new Map<string, FrameRect>()
  for (const tunnel of byDepth) {
    const data = tunnel.data as ReactFlowTunnelData
    const rect = rectFromTunnelData(nodes, data, rects, options)
    if (rect) rects.set(tunnel.id, rect)
  }
  return rects
}

/**
 * Resize every `ecp-tunnel` node from its member nodes' current positions.
 * @category App
 */
export function resizeTunnelNodes(
  nodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): ReactFlowNode[] {
  const out = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    style: node.style ? { ...node.style } : undefined,
    data: { ...node.data },
  }))
  const rects = computeAllTunnelRects(out, options)
  for (const tunnel of out) {
    if (tunnel.type !== "ecp-tunnel") continue
    const rect = rects.get(tunnel.id)
    if (!rect) continue
    tunnel.position = { x: rect.x, y: rect.y }
    tunnel.style = {
      ...(tunnel.style ?? {}),
      width: rect.width,
      height: rect.height,
      pointerEvents: "none",
    }
  }
  return out
}

/**
 * Tunnel rectangles after {@link resizeTunnelNodes}.
 * @category App
 */
export function tunnelRects(
  nodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): Map<string, FrameRect> {
  return computeAllTunnelRects(nodes, options)
}

/**
 * Returns true when a node's center lies inside the given tunnel rectangle (± tolerance).
 * @category App
 */
export function isNodeInsideTunnel(
  node: ReactFlowNode,
  tunnelRect: FrameRect,
  nodeWidth = DEFAULT_NODE_WIDTH,
  tolerance = 1,
): boolean {
  const box = nodeBox(node, nodeWidth)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return (
    cx >= tunnelRect.x - tolerance &&
    cy >= tunnelRect.y - tolerance &&
    cx <= tunnelRect.x + tunnelRect.width + tolerance &&
    cy <= tunnelRect.y + tunnelRect.height + tolerance
  )
}
