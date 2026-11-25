import {
  boundsAroundNodeIds,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  FRAME_PADDING,
  frameBounds,
  type FrameRect,
} from "./layout.js"
import type { ReactFlowDocument, ReactFlowEncodeOptions, ReactFlowFrameData, ReactFlowNode } from "./types.js"

const BAND_GAP = 24
/** Tolerance for start / end pin alignment to the container stroke (pixels). */
export const CONTAINER_PIN_TOLERANCE = 1

/**
 * Band metadata collected while encoding a structure container.
 * @category App
 */
export interface StructureFrameBand {
  /** Layout cluster id. */
  bandId: string
  /** Band label (`then`, `path 2`, …). */
  label: string
  /** Node ids in this band (excludes pinned start / end nodes). */
  memberNodeIds: string[]
}

/**
 * Structure container geometry input shared by the encoder and post-layout pass.
 * @category App
 */
export interface StructureFrameGeometry {
  /** Frame node id (`ecp:frame:…`). */
  frameId: string
  structureKind: "if" | "parallel" | "loop"
  /** Pinned structure head node id. */
  startNodeId: string
  /** Pinned loop `end` node id, when present. */
  endNodeId?: string
  bands: StructureFrameBand[]
  memberNodeIds: string[]
  childFrameIds: string[]
  depth: number
  /**
   * Filled by {@link applyContainerGeometry}: horizontal divider offsets from the frame top.
   */
  bandDividerYs?: number[]
}

function nodeMap(nodes: readonly ReactFlowNode[]): Map<string, ReactFlowNode> {
  return new Map(nodes.map((node) => [node.id, node]))
}

function translateMemberNodes(
  nodes: ReactFlowNode[],
  byId: Map<string, ReactFlowNode>,
  memberIds: readonly string[],
  dx: number,
  dy: number,
): void {
  if (dx === 0 && dy === 0) return
  for (const id of memberIds) {
    const node = byId.get(id)
    if (!node) continue
    node.position = { x: node.position.x + dx, y: node.position.y + dy }
    const index = nodes.findIndex((n) => n.id === id)
    if (index >= 0) nodes[index] = node
  }
}

function centerX(node: ReactFlowNode, nodeWidth: number): number {
  const styleWidth = node.style?.width
  const width = typeof styleWidth === "number" && Number.isFinite(styleWidth) ? styleWidth : nodeWidth
  return node.position.x + width / 2
}

function pinHorizontal(node: ReactFlowNode, centerTargetX: number, nodeWidth: number): void {
  node.position = { ...node.position, x: centerTargetX - nodeWidth / 2 }
}

function stackIfBands(
  nodes: ReactFlowNode[],
  byId: Map<string, ReactFlowNode>,
  frame: StructureFrameGeometry,
  nodeWidth: number,
  nodeHeight: number,
): void {
  const thenBand = frame.bands.find((band) => band.label === "then")
  const elseBand = frame.bands.find((band) => band.label === "else")
  if (!thenBand || !elseBand || elseBand.memberNodeIds.length === 0) return
  const thenBounds = boundsAroundNodeIds(nodes, thenBand.memberNodeIds, nodeWidth, nodeHeight)
  const elseBounds = boundsAroundNodeIds(nodes, elseBand.memberNodeIds, nodeWidth, nodeHeight)
  if (!thenBounds || !elseBounds) return
  const targetTop = thenBounds.y + thenBounds.height + BAND_GAP
  const dy = targetTop - elseBounds.y
  if (dy > 0) translateMemberNodes(nodes, byId, elseBand.memberNodeIds, 0, dy)
}

function ifBandDividerOffsetY(
  nodes: readonly ReactFlowNode[],
  frame: StructureFrameGeometry,
  rect: FrameRect,
  nodeWidth: number,
  nodeHeight: number,
): number | undefined {
  const thenBand = frame.bands.find((band) => band.label === "then")
  const elseBand = frame.bands.find((band) => band.label === "else")
  if (!thenBand || !elseBand || elseBand.memberNodeIds.length === 0) return undefined
  const thenBounds = boundsAroundNodeIds(nodes, thenBand.memberNodeIds, nodeWidth, nodeHeight)
  const elseBounds = boundsAroundNodeIds(nodes, elseBand.memberNodeIds, nodeWidth, nodeHeight)
  if (!thenBounds || !elseBounds) return undefined
  const midY = (thenBounds.y + thenBounds.height + elseBounds.y) / 2
  return midY - rect.y
}

/**
 * Snap a layout frame box so its left / right edges lie on pinned start / end centers.
 * @category App
 */
export function adjustFrameRectForPins(
  rect: FrameRect,
  nodes: readonly ReactFlowNode[],
  frame: Pick<StructureFrameGeometry, "startNodeId" | "endNodeId">,
  nodeWidth: number,
): FrameRect {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let { x, width } = rect
  const { y, height } = rect
  const start = byId.get(frame.startNodeId)
  if (start) {
    const cx = centerX(start, nodeWidth)
    const shift = x - cx
    x = cx
    width += shift
  }
  if (frame.endNodeId) {
    const end = byId.get(frame.endNodeId)
    if (end) width = centerX(end, nodeWidth) - x
  }
  return { x, y, width, height }
}

function pinStartEnd(
  nodes: ReactFlowNode[],
  byId: Map<string, ReactFlowNode>,
  frame: StructureFrameGeometry,
  rect: FrameRect,
  nodeWidth: number,
): void {
  const start = byId.get(frame.startNodeId)
  if (start) {
    pinHorizontal(start, rect.x, nodeWidth)
    byId.set(start.id, start)
    const i = nodes.findIndex((n) => n.id === start.id)
    if (i >= 0) nodes[i] = start
  }
  if (frame.endNodeId) {
    const end = byId.get(frame.endNodeId)
    if (end) {
      pinHorizontal(end, rect.x + rect.width, nodeWidth)
      byId.set(end.id, end)
      const i = nodes.findIndex((n) => n.id === end.id)
      if (i >= 0) nodes[i] = end
    }
  }
}

/**
 * Pin structure start / end nodes on the container stroke and stack `if` bands vertically.
 * @category App
 */
export function applyContainerGeometry(
  document: ReactFlowDocument,
  structureFrames: StructureFrameGeometry[],
  options?: ReactFlowEncodeOptions,
): ReactFlowDocument {
  const nodeWidth = options?.nodeWidth ?? 260
  const nodeHeight = options?.nodeHeight ?? 160
  const nodes = document.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    style: node.style ? { ...node.style } : undefined,
  }))
  const byId = nodeMap(nodes)

  const sorted = [...structureFrames].sort((a, b) => a.depth - b.depth)
  for (const frame of sorted) {
    if (frame.structureKind === "if") stackIfBands(nodes, byId, frame, nodeWidth, nodeHeight)
  }

  const membership = sorted.map((frame) => ({
    frameId: frame.frameId,
    memberNodeIds: frame.memberNodeIds,
    childFrameIds: frame.childFrameIds,
    depth: frame.depth,
  }))

  const boundsOptions = { nodeWidth, nodeHeight, headerless: true as const }
  let rects = frameBounds(nodes, membership, boundsOptions)
  for (const frame of sorted) {
    const raw = rects.get(frame.frameId)
    if (!raw) continue
    const rect = adjustFrameRectForPins(raw, nodes, frame, nodeWidth)
    pinStartEnd(nodes, byId, frame, rect, nodeWidth)
  }

  rects = frameBounds(nodes, membership, boundsOptions)
  for (const frame of sorted) {
    const raw = rects.get(frame.frameId)
    if (!raw) continue
    const rect = adjustFrameRectForPins(raw, nodes, frame, nodeWidth)
    pinStartEnd(nodes, byId, frame, rect, nodeWidth)
    if (frame.structureKind === "if") {
      const divider = ifBandDividerOffsetY(nodes, frame, rect, nodeWidth, nodeHeight)
      if (divider !== undefined) frame.bandDividerYs = [divider]
    }
  }

  return { nodes, edges: document.edges.map((edge) => ({ ...edge })) }
}

/**
 * Returns true when a node's center x is pinned on the given container edge (± tolerance).
 * @category App
 */
export function isPinnedToContainerEdge(
  node: ReactFlowNode,
  frameRect: FrameRect,
  edge: "left" | "right",
  nodeWidth: number,
  tolerance = CONTAINER_PIN_TOLERANCE,
): boolean {
  const cx = centerX(node, nodeWidth)
  const target = edge === "left" ? frameRect.x : frameRect.x + frameRect.width
  return Math.abs(cx - target) <= tolerance
}

/**
 * Lay out the containers of a document whose nodes are already placed (by dagre, or dragged): each container's box
 * holds every node inside it, its start node is moved so its centre sits on the left edge and a loop's `end` node so
 * its centre sits on the right edge, and band dividers are placed between the bands. Innermost containers first.
 * The encoder, the canvas and the dragged-position overlay all use this, so the rule is the same everywhere.
 * @category App
 */
export function pinContainers(nodes: readonly ReactFlowNode[], nodeWidth = DEFAULT_NODE_WIDTH): ReactFlowNode[] {
  const out = nodes.map((node) => ({ ...node, position: { ...node.position } }))
  const byId = new Map(out.map((node) => [node.id, node]))
  const widthOf = (node: ReactFlowNode): number => {
    const raw = node.style?.width
    return typeof raw === "number" && Number.isFinite(raw) ? raw : nodeWidth
  }
  const frames = out
    .filter((node) => node.type === "ecp-frame")
    .sort((a, b) => (b.data as ReactFlowFrameData).depth - (a.data as ReactFlowFrameData).depth)
  const pad = FRAME_PADDING
  for (const frame of frames) {
    const data = frame.data as ReactFlowFrameData
    const start = byId.get(data.startNodeId)
    const end = data.endNodeId ? byId.get(data.endNodeId) : undefined
    const bodyIds = data.memberNodeIds.filter((id) => id !== data.startNodeId && id !== data.endNodeId)
    const body = boundsAroundNodeIds(out, bodyIds, nodeWidth, DEFAULT_NODE_HEIGHT)
    const all = boundsAroundNodeIds(out, data.memberNodeIds, nodeWidth, DEFAULT_NODE_HEIGHT)
    if (!all) continue
    const startHalf = start ? widthOf(start) / 2 : 0
    const endHalf = end ? widthOf(end) / 2 : 0
    let left: number
    let right: number
    if (body) {
      left = body.x - pad.x - startHalf
      right = body.x + body.width + pad.x + endHalf
    } else {
      left = start ? start.position.x + startHalf : all.x
      right = Math.max(left + nodeWidth, end ? end.position.x + endHalf : all.x + all.width)
    }
    if (start) start.position.x = left - startHalf
    if (end) end.position.x = right - endHalf
    const top = all.y - pad.y
    const bottom = all.y + all.height + pad.y
    const dividers = bandDividers(out, data, nodeWidth).map((y) => y - top)
    const nextData: ReactFlowFrameData = { ...data }
    if (dividers.length > 0) nextData.bandDividerYs = dividers
    else delete nextData.bandDividerYs
    frame.position = { x: left, y: top }
    frame.style = { ...(frame.style ?? {}), width: right - left, height: bottom - top, pointerEvents: "none" }
    frame.data = nextData as unknown as ReactFlowNode["data"]
  }
  return out
}

/** Absolute y of each divider between consecutive non-empty bands (midway between one band's bottom and the next's top). */
function bandDividers(nodes: readonly ReactFlowNode[], data: ReactFlowFrameData, nodeWidth: number): number[] {
  const boxes = data.bands
    .map((band) => boundsAroundNodeIds(nodes, band.memberNodeIds, nodeWidth, DEFAULT_NODE_HEIGHT))
    .filter((box): box is FrameRect => box !== undefined)
    .sort((a, b) => a.y - b.y)
  const out: number[] = []
  for (let i = 1; i < boxes.length; i += 1) {
    const above = boxes[i - 1]!
    const below = boxes[i]!
    out.push((above.y + above.height + below.y) / 2)
  }
  return out
}

/**
 * Container rectangles after {@link pinContainers}.
 * @category App
 */
export function containerRects(nodes: readonly ReactFlowNode[], nodeWidth = DEFAULT_NODE_WIDTH): Map<string, FrameRect> {
  const rects = new Map<string, FrameRect>()
  for (const node of pinContainers(nodes, nodeWidth)) {
    if (node.type !== "ecp-frame") continue
    rects.set(node.id, {
      x: node.position.x,
      y: node.position.y,
      width: Number(node.style?.width),
      height: Number(node.style?.height),
    })
  }
  return rects
}
