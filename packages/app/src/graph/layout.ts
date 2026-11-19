import dagre from "@dagrejs/dagre"
import type {
  ReactFlowDocument,
  ReactFlowEncodeOptions,
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

function estimateNodeHeight(node: ReactFlowNode, fallback: number): number {
  const data = node.data as ReactFlowStepData | ReactFlowIoData
  const rows =
    node.type === "ecp-step"
      ? Math.max(data.inputs.length, 1) + Math.max(data.outputs.length, 1)
      : Math.max(data.inputs.length + data.outputs.length, 1)
  return Math.max(fallback, HEADER_ESTIMATE + rows * PORT_ROW_ESTIMATE)
}

/**
 * Axis-aligned bounds of the given step nodes after layout.
 * @category App
 */
export function boundsAroundNodeIds(
  nodes: ReactFlowNode[],
  nodeIds: readonly string[],
  nodeWidth: number,
  defaultNodeHeight: number,
): { x: number; y: number; width: number; height: number } | undefined {
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
    const width = node.style?.width ?? nodeWidth
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
 * Assign dagre layout positions to nodes, returning a new document.
 * Loop-back route edges are drawn but excluded from rank constraints.
 * @category App
 */
export function layoutReactFlowDocument(
  doc: ReactFlowDocument,
  options?: ReactFlowEncodeOptions,
): ReactFlowDocument {
  const direction = options?.direction ?? "LR"
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: direction, nodesep: 56, ranksep: 96, marginx: 24, marginy: 24 })

  const ids = new Set(doc.nodes.map((node) => node.id))
  const heights = new Map(doc.nodes.map((node) => [node.id, estimateNodeHeight(node, nodeHeight)]))

  for (const node of doc.nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: heights.get(node.id) ?? nodeHeight })
  }
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
