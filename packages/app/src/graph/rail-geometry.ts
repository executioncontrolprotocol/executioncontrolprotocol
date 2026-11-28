import type { Node } from "@executioncontrolprotocol/protocol"
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./layout.js"
import { nodeBox } from "./tunnel-geometry.js"
import { TREE_END_HEIGHT, TREE_END_WIDTH, TREE_JOIN_GAP } from "./tree-layout.js"
import {
  endMarkerId,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  type ReactFlowControlData,
  type ReactFlowNode,
  type ReactFlowEncodeOptions,
  type ReactFlowStepData,
} from "./types.js"

/** Vertical offset from node top to the first port row (pixels). @category App */
export const RAIL_HEADER_OFFSET = 72
/** Height of one port row (pixels). @category App */
export const RAIL_PORT_ROW = 22

/**
 * Vertical centre of an output or control tunnel port handle (flow coordinates).
 * @category App
 */
export function outputHandleY(
  node: ReactFlowNode,
  handleId: string,
  nodeWidth = DEFAULT_NODE_WIDTH,
  defaultHeight = DEFAULT_NODE_HEIGHT,
): number {
  const box = nodeBox(node, nodeWidth, defaultHeight)
  if (node.type === "ecp-io") {
    const data = node.data as { ports?: { id: string }[] }
    const index = Math.max(0, (data.ports ?? []).findIndex((port) => port.id === handleId))
    return box.y + RAIL_HEADER_OFFSET + index * RAIL_PORT_ROW + RAIL_PORT_ROW / 2
  }
  const data = node.data as ReactFlowControlData | ReactFlowStepData
  const inputs = "inputs" in data ? data.inputs.length : 0
  const outputs = "outputs" in data ? data.outputs : []
  const outputIndex = Math.max(0, outputs.findIndex((port) => port.id === handleId))
  return box.y + RAIL_HEADER_OFFSET + inputs * RAIL_PORT_ROW + outputIndex * RAIL_PORT_ROW + RAIL_PORT_ROW / 2
}

/**
 * Vertical centre of an input port handle (flow coordinates).
 * @category App
 */
export function inputHandleY(
  node: ReactFlowNode,
  handleId: string,
  nodeWidth = DEFAULT_NODE_WIDTH,
  defaultHeight = DEFAULT_NODE_HEIGHT,
): number {
  const box = nodeBox(node, nodeWidth, defaultHeight)
  const data = node.data as ReactFlowControlData | ReactFlowStepData
  const inputs = "inputs" in data ? data.inputs : []
  const index = Math.max(0, inputs.findIndex((port) => port.id === handleId))
  return box.y + RAIL_HEADER_OFFSET + index * RAIL_PORT_ROW + RAIL_PORT_ROW / 2
}

/**
 * Horizontal attachment point for a source (right edge of the node box).
 * @category App
 */
export function sourceAttachX(node: ReactFlowNode, nodeWidth = DEFAULT_NODE_WIDTH): number {
  return nodeBox(node, nodeWidth).x + nodeBox(node, nodeWidth).width
}

/**
 * Horizontal attachment point for a target (left edge of the node box).
 * @category App
 */
export function targetAttachX(node: ReactFlowNode, nodeWidth = DEFAULT_NODE_WIDTH): number {
  return nodeBox(node, nodeWidth).x
}

/** Padding (flow pixels) around a side's nodes; grows per nested control level. @category App */
export const SIDE_BAND_PADDING = 18
const SIDE_BAND_NEST_STEP = 12
/** Stroke width of a join back to the rail and of a side's neck from its port. @category App */
export const JOIN_RIBBON_WIDTH = 18
const BAND_RIGHT_GAP = 12

/** Ids of every laid-out node in a list's subtree, including nested controls' end markers. */
export function subtreeIds(list: readonly Node[]): string[] {
  const out: string[] = []
  for (const node of list) {
    out.push(node.id)
    if (node.type === "if") {
      out.push(endMarkerId(node.id, "then"), endMarkerId(node.id, "else"))
      out.push(...subtreeIds(node.then), ...subtreeIds(node.else ?? []))
    } else if (node.type === "parallel") {
      node.paths.forEach((path, index) => {
        out.push(endMarkerId(node.id, `path-${index + 1}`))
        out.push(...subtreeIds(path))
      })
    } else if (node.type === "loop") {
      out.push(endMarkerId(node.id, "loop"), ...subtreeIds(node.steps))
    }
  }
  return out
}

/** How many control levels a list contains (0 when it holds only steps). @category App */
export function controlNestingDepth(list: readonly Node[]): number {
  let depth = 0
  for (const node of list) {
    if (node.type === "if") {
      depth = Math.max(depth, 1 + Math.max(controlNestingDepth(node.then), controlNestingDepth(node.else ?? [])))
    } else if (node.type === "parallel") {
      depth = Math.max(depth, 1 + Math.max(0, ...node.paths.map(controlNestingDepth)))
    } else if (node.type === "loop") {
      depth = Math.max(depth, 1 + controlNestingDepth(node.steps))
    }
  }
  return depth
}

function boundsOf(
  ids: readonly string[],
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number; right: number; bottom: number } | undefined {
  let x = Infinity
  let y = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const id of ids) {
    const node = byId.get(id)
    if (!node) continue
    const box = nodeBox(node, nodeWidth, nodeHeight)
    x = Math.min(x, box.x)
    y = Math.min(y, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  return Number.isFinite(x) ? { x, y, right, bottom } : undefined
}

/**
 * Axis-aligned side band from the control node's right edge through its end marker.
 * @category App
 */
export function computeSideBand(
  control: ReactFlowNode,
  marker: ReactFlowNode,
  sideNodes: readonly Node[],
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth = DEFAULT_NODE_WIDTH,
  nodeHeight = DEFAULT_NODE_HEIGHT,
): { x: number; y: number; width: number; height: number } {
  const controlBox = nodeBox(control, nodeWidth, nodeHeight)
  const markerBox = nodeBox(marker, nodeWidth, nodeHeight)
  const pad = SIDE_BAND_PADDING + SIDE_BAND_NEST_STEP * controlNestingDepth(sideNodes)
  const inner = boundsOf([...subtreeIds(sideNodes), marker.id], byId, nodeWidth, nodeHeight) ?? {
    x: markerBox.x,
    y: markerBox.y,
    right: markerBox.x + markerBox.width,
    bottom: markerBox.y + markerBox.height,
  }
  const x = controlBox.x + controlBox.width
  const right = markerBox.x + markerBox.width + BAND_RIGHT_GAP
  const top = inner.y - pad
  const bottom = inner.bottom + pad
  return { x, y: top, width: Math.max(0, right - x), height: bottom - top }
}

/**
 * Curve from a control node's tunnel port into its side band (same geometry as the rail layer neck).
 * @category App
 */
export function neckPathD(
  control: ReactFlowNode,
  handleId: string,
  band: { x: number; y: number; height: number },
  nodeWidth = DEFAULT_NODE_WIDTH,
  nodeHeight = DEFAULT_NODE_HEIGHT,
): string {
  const startX = sourceAttachX(control, nodeWidth)
  const startY = outputHandleY(control, handleId, nodeWidth, nodeHeight)
  const endX = band.x + 24
  const endY = Math.min(Math.max(startY, band.y + JOIN_RIBBON_WIDTH), band.y + band.height - JOIN_RIBBON_WIDTH)
  const midX = (startX + endX) / 2
  return `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`
}

/**
 * Join from an end marker back to the rail at `mergeX` / `railY`.
 * @category App
 */
export function joinPathD(
  marker: ReactFlowNode,
  mergeX: number,
  railY: number,
  nodeWidth = DEFAULT_NODE_WIDTH,
  nodeHeight = DEFAULT_NODE_HEIGHT,
): string {
  const box = nodeBox(marker, nodeWidth, nodeHeight)
  const startX = box.x + box.width
  const startY = box.y + box.height / 2
  const bend = Math.min(40, Math.max(12, (mergeX - startX) / 2))
  const levelEnd = Math.max(startX, mergeX - bend)
  return `M ${startX} ${startY} L ${levelEnd} ${startY} C ${mergeX} ${startY} ${levelEnd} ${railY} ${mergeX} ${railY}`
}

/**
 * Branch along a join: from lane Y at the marker through the merge curve into the target port.
 * @category App
 */
export function joinBranchPathD(
  marker: ReactFlowNode,
  mergeX: number,
  targetX: number,
  laneY: number,
  targetY: number,
  nodeWidth = DEFAULT_NODE_WIDTH,
  nodeHeight = DEFAULT_NODE_HEIGHT,
): string {
  const box = nodeBox(marker, nodeWidth, nodeHeight)
  const markerRight = box.x + box.width
  const bend = Math.min(40, Math.max(12, (mergeX - markerRight) / 2))
  const levelEnd = Math.max(markerRight, mergeX - bend)
  const c1x = mergeX
  const c1y = laneY
  const c2x = Math.min(levelEnd, targetX - 12)
  const c2y = targetY
  return `M ${markerRight} ${laneY} L ${levelEnd} ${laneY} C ${c1x} ${c1y} ${c2x} ${c2y} ${targetX} ${targetY}`
}

/**
 * X coordinate where an `if` / `parallel`'s sides merge back into the rail.
 * @category App
 */
export function mergeXAfterStructure(structureId: string, laidNodes: readonly ReactFlowNode[]): number {
  const markers = laidNodes.filter((node) => {
    if (node.type !== "ecp-end") return false
    const data = node.data as { structureId?: string }
    return data.structureId === structureId
  })
  let right = 0
  for (const marker of markers) {
    const box = nodeBox(marker, TREE_END_WIDTH)
    right = Math.max(right, box.x + box.width)
  }
  return right + TREE_JOIN_GAP
}

/**
 * Resolve a tunnel port handle id for an `if` / `parallel` control side.
 * @category App
 */
export function sideHandleId(kind: "then" | "else" | "path", pathIndex?: number): string {
  if (kind === "then") return IF_THEN_HANDLE
  if (kind === "else") return IF_ELSE_HANDLE
  return `${PARALLEL_PATH_HANDLE_PREFIX}${pathIndex ?? 1}`
}

/** Gap between an end label and its tunnel edge (flow pixels). @category App */
export const END_MARKER_INSET = 6

/**
 * Snap drawn end markers onto the top or bottom edge of their side tunnel bands.
 * @category App
 */
export function alignEndMarkersToBandEdges(
  roots: readonly Node[],
  nodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): ReactFlowNode[] {
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const yById = new Map<string, number>()

  // Labels sit just inside their tunnel's edge, so they never spill into a neighbouring tunnel and the branches running
  // through the middle stay visible.
  const setEdgeY = (markerId: string, edgeY: number, edge: "top" | "bottom"): void => {
    yById.set(markerId, edge === "top" ? edgeY + END_MARKER_INSET : edgeY - TREE_END_HEIGHT - END_MARKER_INSET)
  }

  const bandVerticalEdges = (
    control: ReactFlowNode,
    sideNodes: readonly Node[],
  ): { top: number; bottom: number } => {
    const pad = SIDE_BAND_PADDING + SIDE_BAND_NEST_STEP * controlNestingDepth(sideNodes)
    const inner = boundsOf(subtreeIds(sideNodes), byId, nodeWidth, nodeHeight) ?? {
      x: control.position.x,
      y: control.position.y,
      right: control.position.x,
      bottom: control.position.y,
    }
    return { top: inner.y - pad, bottom: inner.bottom + pad }
  }

  const walk = (node: Node): void => {
    if (node.type === "if") {
      for (const side of ["then", "else"] as const) {
        const marker = byId.get(endMarkerId(node.id, side))
        const control = byId.get(node.id)
        if (!marker || !control) continue
        const sideNodes = side === "then" ? node.then : (node.else ?? [])
        const edges = bandVerticalEdges(control, sideNodes)
        setEdgeY(marker.id, side === "then" ? edges.top : edges.bottom, side === "then" ? "top" : "bottom")
      }
      for (const child of [...node.then, ...(node.else ?? [])]) walk(child)
      return
    }
    if (node.type === "parallel") {
      node.paths.forEach((path, index) => {
        const pathKey = `path-${index + 1}` as const
        const marker = byId.get(endMarkerId(node.id, pathKey))
        const control = byId.get(node.id)
        if (!marker || !control) return
        const edges = bandVerticalEdges(control, path)
        const last = index === node.paths.length - 1
        setEdgeY(marker.id, last ? edges.bottom : edges.top, last ? "bottom" : "top")
        for (const child of path) walk(child)
      })
      return
    }
    if (node.type === "loop") {
      const marker = byId.get(endMarkerId(node.id, "loop"))
      const control = byId.get(node.id)
      if (marker && control) {
        const edges = bandVerticalEdges(control, node.steps)
        setEdgeY(marker.id, edges.top, "top")
      }
      for (const child of node.steps) walk(child)
    }
  }

  for (const root of roots) walk(root)

  return nodes.map((node) => {
    const y = yById.get(node.id)
    if (y === undefined) return node
    return { ...node, position: { ...node.position, y } }
  })
}