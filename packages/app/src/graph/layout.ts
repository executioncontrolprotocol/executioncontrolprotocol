import dagre from "@dagrejs/dagre"
import type {
  ReactFlowDocument,
  ReactFlowEncodeOptions,
  ReactFlowLoopItemsData,
  ReactFlowIoData,
  ReactFlowNode,
  ReactFlowStepData,
} from "./types.js"

const DEFAULT_NODE_WIDTH = 260
const DEFAULT_NODE_HEIGHT = 160
const PORT_ROW_ESTIMATE = 18
const HEADER_ESTIMATE = 72

/** Padding around parallel line frames (pixels). */
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
  const data = node.data as ReactFlowStepData | ReactFlowIoData | ReactFlowLoopItemsData | undefined
  if (!data) return fallback
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
  options?: { nodeWidth?: number; nodeHeight?: number },
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
    const labelGap = pad.label
    rects.set(spec.frameId, {
      x: inner.x - pad.x,
      y: inner.y - pad.y - labelGap,
      width: inner.width + pad.x * 2,
      height: inner.height + pad.y * 2 + labelGap,
    })
  }
  return rects
}

/**
 * Assign dagre layout positions to nodes, returning a new document.
 * Loop-back route edges are drawn but excluded from rank constraints.
 * @category App
 */
/**
 * A structure container for layout: dagre keeps each cluster's nodes together and sibling clusters apart, so the
 * frames drawn around them afterwards don't overlap.
 * @category App
 */
export interface LayoutCluster {
  /** Cluster id (the frame id). */
  id: string
  /** Every drawn node inside the structure, at any depth. */
  memberNodeIds: readonly string[]
  /** Clusters directly inside this one. */
  childClusterIds: readonly string[]
}

export function layoutReactFlowDocument(
  doc: ReactFlowDocument,
  options?: ReactFlowEncodeOptions,
  clusters: readonly LayoutCluster[] = [],
): ReactFlowDocument {
  const direction = options?.direction ?? "LR"
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT

  const graph = new dagre.graphlib.Graph({ compound: clusters.length > 0 })
  graph.setDefaultEdgeLabel(() => ({}))
  // Clustered layouts spend ranks on container borders; a smaller rank gap keeps them about as wide as before.
  graph.setGraph({ rankdir: direction, nodesep: 56, ranksep: clusters.length > 0 ? 32 : 96, marginx: 24, marginy: 24 })

  const ids = new Set(doc.nodes.map((node) => node.id))
  const heights = new Map(doc.nodes.map((node) => [node.id, estimateNodeHeight(node, nodeHeight)]))

  for (const node of doc.nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: heights.get(node.id) ?? nodeHeight })
  }
  applyLayoutClusters(graph, clusters, ids)
  for (const edge of doc.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    if (edge.data.kind === "route" && edge.data.loopBack) continue
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const nodes = doc.nodes.map((node): ReactFlowNode => {
    const laid = graph.node(node.id) as { x: number; y: number } | undefined
    if (!laid) return { ...node, position: { ...node.position } }
    const height = heights.get(node.id) ?? nodeHeight
    return {
      ...node,
      position: { x: laid.x - nodeWidth / 2, y: laid.y - height / 2 },
      style: { ...node.style, width: nodeWidth },
    }
  })
  return { nodes, edges: doc.edges.map((edge) => ({ ...edge })) }
}

/**
 * Register clusters on a compound dagre graph: each node is parented to its innermost cluster and each cluster to the
 * cluster that lists it as a child. Clusters with no nodes in this graph are skipped.
 */
function applyLayoutClusters(
  graph: dagre.graphlib.Graph,
  clusters: readonly LayoutCluster[],
  nodeIds: ReadonlySet<string>,
): void {
  if (clusters.length === 0) return
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]))
  const present = clusters.filter((cluster) => cluster.memberNodeIds.some((id) => nodeIds.has(id)))
  const presentIds = new Set(present.map((cluster) => cluster.id))
  const parentOf = new Map<string, string>()
  for (const cluster of present) {
    for (const child of cluster.childClusterIds) if (presentIds.has(child)) parentOf.set(child, cluster.id)
  }
  for (const cluster of present) {
    graph.setNode(cluster.id, {})
    const parent = parentOf.get(cluster.id)
    if (parent) graph.setParent(cluster.id, parent)
  }
  for (const cluster of present) {
    const inChildren = new Set(
      cluster.childClusterIds.flatMap((child) => byId.get(child)?.memberNodeIds ?? []),
    )
    for (const id of cluster.memberNodeIds) {
      if (nodeIds.has(id) && !inChildren.has(id)) graph.setParent(id, cluster.id)
    }
  }
}
