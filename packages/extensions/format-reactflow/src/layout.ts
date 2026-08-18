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

function estimateNodeHeight(node: ReactFlowNode, fallback: number): number {
  if (node.type === "ecp-step") {
    const data = node.data as ReactFlowStepData
    const portRows = Math.max(data.inputs.length, 1) + Math.max(data.outputs.length, 1)
    return Math.max(fallback, HEADER_ESTIMATE + portRows * PORT_ROW_ESTIMATE)
  }
  if (node.type === "ecp-io") {
    const data = node.data as ReactFlowIoData
    const portRows = Math.max(data.inputs.length + data.outputs.length, 1)
    return Math.max(fallback, HEADER_ESTIMATE + portRows * PORT_ROW_ESTIMATE)
  }
  return fallback
}

/**
 * Assign dagre layout positions to nodes (mutates a copy).
 * @category Encoding
 */
export function layoutReactFlowDocument(
  doc: ReactFlowDocument,
  options?: ReactFlowEncodeOptions
): ReactFlowDocument {
  const direction = options?.direction ?? "LR"
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 56,
    ranksep: 96,
    marginx: 24,
    marginy: 24,
  })

  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const heights = new Map(
    doc.nodes.map((node) => [node.id, estimateNodeHeight(node, nodeHeight)] as const)
  )

  for (const node of doc.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: heights.get(node.id) ?? nodeHeight })
  }

  for (const edge of doc.edges) {
    if (byId.has(edge.source) && byId.has(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const nodes: ReactFlowNode[] = doc.nodes.map((node) => {
    const laid = g.node(node.id)
    const height = heights.get(node.id) ?? nodeHeight
    if (!laid) return { ...node, position: { ...node.position } }
    return {
      ...node,
      position: {
        x: laid.x - nodeWidth / 2,
        y: laid.y - height / 2,
      },
      // Width only — height comes from content (top inputs / bottom outputs).
      style: {
        ...node.style,
        width: nodeWidth,
      },
    }
  })

  return { nodes, edges: doc.edges.map((e) => ({ ...e })) }
}
