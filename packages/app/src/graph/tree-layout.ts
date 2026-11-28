import type { IfNode, LoopNode, Node, ParallelNode } from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
function sidePlaceholderId(structureId: string, sideKey: string): string {
  return `ecp:placeholder:${structureId}:${sideKey}`
}
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./layout.js"
import type { ReactFlowDocument, ReactFlowEncodeOptions, ReactFlowNode } from "./types.js"
import { endMarkerId } from "./types.js"

/** Default flow node width for tree layout (pixels). @category App */
export const TREE_NODE_WIDTH = DEFAULT_NODE_WIDTH
/** Horizontal gap between blocks in a row (pixels). @category App */
export const TREE_GAP_X = 48
/** Vertical gap between sibling side rows (pixels). @category App */
export const TREE_GAP_Y = 28
/** Padding around side / loop tunnel bounds (pixels). @category App */
export const TREE_TUNNEL_PADDING = 20
/** Label band above side tubes (matches tunnel geometry). @category App */
export const TREE_TUNNEL_LABEL = 22
/** Synthetic `end` node width (pixels). @category App */
export const TREE_END_WIDTH = 90
/** Synthetic `end` node height (pixels). @category App */
export const TREE_END_HEIGHT = 32
/** Reserved height for an empty branch lane (pixels). @category App */
export const TREE_EMPTY_SIDE_HEIGHT = 25
/** Horizontal gap after the longest side marker before the merge / next sibling (pixels). @category App */
export const TREE_JOIN_GAP = 48

const PORT_ROW_ESTIMATE = 18
const HEADER_ESTIMATE = 72

interface Size {
  width: number
  height: number
}

/**
 * Minimum vertical gap between stacked side rows so padded tubes do not overlap.
 * @category App
 */
export function sideStackGap(): number {
  return Math.max(
    TREE_GAP_Y,
    TREE_TUNNEL_PADDING * 2 + TREE_TUNNEL_LABEL + TREE_TUNNEL_PADDING + 6,
  )
}

interface LayoutCtx {
  byId: Map<string, ReactFlowNode>
  positions: Map<string, { x: number; y: number }>
  nodeWidth: number
  nodeHeight: number
}

function measureHeight(rf: ReactFlowNode | undefined, fallback: number): number {
  if (!rf) return fallback
  if (rf.type === "ecp-end") return TREE_END_HEIGHT
  if (rf.type === "ecp-placeholder") return TREE_EMPTY_SIDE_HEIGHT
  const data = rf.data as { inputs?: unknown[]; outputs?: unknown[] } | undefined
  if (!data?.inputs || !data.outputs) return fallback
  const rows =
    rf.type === "ecp-step" || rf.type === "ecp-loop"
      ? Math.max(data.inputs.length, 1) + Math.max(data.outputs.length, 1)
      : Math.max(data.inputs.length + data.outputs.length, 1)
  return Math.max(fallback, HEADER_ESTIMATE + rows * PORT_ROW_ESTIMATE)
}

function measureWidth(rf: ReactFlowNode | undefined, defaultW: number): number {
  if (!rf) return defaultW
  if (rf.type === "ecp-end") return TREE_END_WIDTH
  const raw = rf.style?.width
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  return defaultW
}

function setPos(ctx: LayoutCtx, id: string, x: number, y: number): void {
  ctx.positions.set(id, { x, y })
}

/**
 * Lay out a row of manifest blocks left-to-right, sharing one horizontal centre line.
 * @category App
 */
function layoutRow(nodes: readonly Node[], startX: number, centerY: number, ctx: LayoutCtx): Size {
  if (nodes.length === 0) return { width: 0, height: 0 }
  let x = startX
  let rowWidth = 0
  let rowHeight = 0
  nodes.forEach((node, index) => {
    if (index > 0) {
      x += TREE_GAP_X
      rowWidth += TREE_GAP_X
    }
    const size = layoutBlock(node, x, centerY, ctx)
    x += size.width
    rowWidth += size.width
    rowHeight = Math.max(rowHeight, size.height)
  })
  return { width: rowWidth, height: rowHeight }
}

/**
 * Lay out one manifest node as a block on a row.
 * @category App
 */
function layoutBlock(node: Node, x: number, centerY: number, ctx: LayoutCtx): Size {
  if (isStepNode(node)) return layoutLeaf(node.id, x, centerY, ctx)
  if (node.type === "if") return layoutIf(node, x, centerY, ctx)
  if (node.type === "parallel") return layoutParallel(node, x, centerY, ctx)
  if (node.type === "loop") return layoutLoop(node, x, centerY, ctx)
  return { width: 0, height: 0 }
}

function layoutLeaf(id: string, x: number, centerY: number, ctx: LayoutCtx): Size {
  const rf = ctx.byId.get(id)
  const w = measureWidth(rf, ctx.nodeWidth)
  const h = measureHeight(rf, ctx.nodeHeight)
  setPos(ctx, id, x, centerY - h / 2)
  return { width: w, height: h }
}

function layoutEmptySide(structureId: string, sideKey: string, x: number, centerY: number, ctx: LayoutCtx): Size {
  const id = sidePlaceholderId(structureId, sideKey)
  setPos(ctx, id, x, centerY - TREE_EMPTY_SIDE_HEIGHT / 2)
  return { width: 0, height: TREE_EMPTY_SIDE_HEIGHT }
}

function layoutIf(node: IfNode, x: number, centerY: number, ctx: LayoutCtx): Size {
  const control = ctx.byId.get(node.id)
  const cW = measureWidth(control, ctx.nodeWidth)
  const cH = measureHeight(control, ctx.nodeHeight)

  const columnX = x + cW + TREE_GAP_X
  const sides: Array<{ key: "then" | "else"; nodes: Node[] }> = [
    { key: "then", nodes: node.then },
    { key: "else", nodes: node.else ?? [] },
  ]

  const sideLayouts: Array<{ size: Size; centerY: number; key: "then" | "else" }> = []
  let columnHeight = 0
  for (let i = 0; i < sides.length; i += 1) {
    if (i > 0) columnHeight += sideStackGap()
    const side = sides[i]!
    let size: Size
    if (side.nodes.length === 0) {
      size = { width: 0, height: TREE_EMPTY_SIDE_HEIGHT }
    } else {
      size = layoutRowMeasure(side.nodes, ctx)
    }
    const sideCy = columnHeight + size.height / 2
    sideLayouts.push({ size, centerY: sideCy, key: side.key })
    columnHeight += size.height
  }

  const columnCy = columnHeight / 2
  const globalOffset = centerY - columnCy

  let mergeRight = columnX
  for (let i = 0; i < sides.length; i += 1) {
    const side = sides[i]!
    const layout = sideLayouts[i]!
    const sideCenter = globalOffset + layout.centerY
    const sideWidth = layout.size.width
    if (side.nodes.length === 0) {
      layoutEmptySide(node.id, side.key, columnX, sideCenter, ctx)
    } else {
      layoutRow(side.nodes, columnX, sideCenter, ctx)
    }
    const endX = columnX + sideWidth + TREE_GAP_X
    const endId = endMarkerId(node.id, side.key)
    setPos(ctx, endId, endX, sideCenter - TREE_END_HEIGHT / 2)
    mergeRight = Math.max(mergeRight, endX + TREE_END_WIDTH)
  }

  const colCy = globalOffset + columnHeight / 2
  setPos(ctx, node.id, x, colCy - cH / 2)

  const blockW = mergeRight + TREE_JOIN_GAP - x
  const blockH = Math.max(cH, columnHeight, TREE_END_HEIGHT)
  return { width: blockW, height: blockH }
}

function layoutRowMeasure(nodes: readonly Node[], ctx: LayoutCtx): Size {
  const scratch = new Map<string, { x: number; y: number }>()
  const sub: LayoutCtx = { ...ctx, positions: scratch }
  return layoutRow(nodes, 0, 0, sub)
}

function layoutParallel(node: ParallelNode, x: number, centerY: number, ctx: LayoutCtx): Size {
  const control = ctx.byId.get(node.id)
  const cW = measureWidth(control, ctx.nodeWidth)
  const cH = measureHeight(control, ctx.nodeHeight)

  const columnX = x + cW + TREE_GAP_X
  const sideLayouts: Array<{ size: Size; centerY: number; nodes: Node[]; index: number }> = []
  let columnHeight = 0
  node.paths.forEach((path, index) => {
    if (index > 0) columnHeight += sideStackGap()
    const size =
      path.length === 0 ? { width: 0, height: TREE_EMPTY_SIDE_HEIGHT } : layoutRowMeasure(path, ctx)
    sideLayouts.push({ size, centerY: columnHeight + size.height / 2, nodes: path, index })
    columnHeight += size.height
  })

  const columnCy = columnHeight / 2
  const globalOffset = centerY - columnCy

  let mergeRight = columnX
  for (const side of sideLayouts) {
    const sideCenter = globalOffset + side.centerY
    const pathKey = `path-${side.index + 1}` as const
    if (side.nodes.length === 0) layoutEmptySide(node.id, pathKey, columnX, sideCenter, ctx)
    else layoutRow(side.nodes, columnX, sideCenter, ctx)
    const endX = columnX + side.size.width + TREE_GAP_X
    const endId = endMarkerId(node.id, pathKey)
    setPos(ctx, endId, endX, sideCenter - TREE_END_HEIGHT / 2)
    mergeRight = Math.max(mergeRight, endX + TREE_END_WIDTH)
  }

  const colCy = globalOffset + columnHeight / 2
  setPos(ctx, node.id, x, colCy - cH / 2)

  return { width: mergeRight + TREE_JOIN_GAP - x, height: Math.max(cH, columnHeight, TREE_END_HEIGHT) }
}

function layoutLoop(node: LoopNode, x: number, centerY: number, ctx: LayoutCtx): Size {
  const control = ctx.byId.get(node.id)
  const endId = endMarkerId(node.id, "loop")
  const cW = measureWidth(control, ctx.nodeWidth)
  const cH = measureHeight(control, ctx.nodeHeight)

  const bodyX = x + cW + TREE_GAP_X
  const body = layoutRow(node.steps, bodyX, centerY, ctx)
  const endX = bodyX + body.width + TREE_GAP_X
  setPos(ctx, node.id, x, centerY - cH / 2)
  setPos(ctx, endId, endX, centerY - TREE_END_HEIGHT / 2)

  const blockW = endX + TREE_END_WIDTH - x
  const blockH = Math.max(cH, body.height, TREE_END_HEIGHT)
  return { width: blockW, height: blockH }
}

/**
 * Assign positions from a manifest tree. Optionally includes Inputs / Outputs bookends.
 * @category App
 */
export function layoutManifestTree(
  roots: readonly Node[],
  nodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
  io?: { acceptsId?: string; returnsId?: string },
): Map<string, { x: number; y: number }> {
  const nodeWidth = options?.nodeWidth ?? TREE_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const ctx: LayoutCtx = {
    byId: new Map(nodes.map((node) => [node.id, node])),
    positions: new Map(),
    nodeWidth,
    nodeHeight,
  }

  const margin = 24
  const centerY = margin + nodeHeight / 2
  let x = margin

  if (io?.acceptsId) {
    const acc = ctx.byId.get(io.acceptsId)
    const w = measureWidth(acc, nodeWidth)
    const h = measureHeight(acc, nodeHeight)
    setPos(ctx, io.acceptsId, x, centerY - h / 2)
    x += w + TREE_GAP_X
  }

  const bodyStart = x
  const body = layoutRow(roots, bodyStart, centerY, ctx)
  x = bodyStart + body.width

  if (io?.returnsId) {
    if (roots.length > 0 || io.acceptsId) x += TREE_GAP_X
    const ret = ctx.byId.get(io.returnsId)
    const h = measureHeight(ret, nodeHeight)
    setPos(ctx, io.returnsId, x, centerY - h / 2)
  }

  return ctx.positions
}

/**
 * Apply tree layout positions to a React Flow document.
 * @category App
 */
export function treeLayoutReactFlowDocument(
  doc: ReactFlowDocument,
  roots: readonly Node[],
  options?: ReactFlowEncodeOptions,
  io?: { acceptsId?: string; returnsId?: string },
): ReactFlowDocument {
  const positions = layoutManifestTree(roots, doc.nodes, options, io)
  const nodeWidth = options?.nodeWidth ?? TREE_NODE_WIDTH

  const nodes = doc.nodes.map((node): ReactFlowNode => {
    const pos = positions.get(node.id)
    const width =
      node.type === "ecp-end"
        ? TREE_END_WIDTH
        : typeof node.style?.width === "number" && Number.isFinite(node.style.width)
          ? node.style.width
          : nodeWidth
    const height = node.type === "ecp-end" ? TREE_END_HEIGHT : node.style?.height
    const laid = pos ?? node.position
    return {
      ...node,
      position: { x: laid.x, y: laid.y },
      style: { ...node.style, width, ...(height !== undefined ? { height } : {}) },
    }
  })

  return { nodes, edges: doc.edges.map((edge) => ({ ...edge })) }
}

/**
 * Offset every non-tunnel position in a laid-out document (for detached rows).
 * @category App
 */
export function translateDocumentNodes(
  doc: ReactFlowDocument,
  dx: number,
  dy: number,
  skipIds?: ReadonlySet<string>,
): ReactFlowDocument {
  const nodes = doc.nodes.map((node): ReactFlowNode => {
    if (node.type === "ecp-tunnel") return node
    if (skipIds?.has(node.id)) return node
    return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
  })
  return { ...doc, nodes }
}

/**
 * Bounding box bottom (y + height) for all non-tunnel nodes in a document.
 * @category App
 */
export function documentMaxY(nodes: readonly ReactFlowNode[], defaultHeight: number): number {
  let max = 0
  for (const node of nodes) {
    if (node.type === "ecp-tunnel") continue
    const h =
      node.type === "ecp-end"
        ? TREE_END_HEIGHT
        : typeof node.style?.height === "number" && Number.isFinite(node.style.height)
          ? node.style.height
          : defaultHeight
    max = Math.max(max, node.position.y + h)
  }
  return max
}