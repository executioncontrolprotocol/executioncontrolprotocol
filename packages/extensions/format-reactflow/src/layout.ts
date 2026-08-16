import dagre from "@dagrejs/dagre"
import type { ReactFlowDocument, ReactFlowEncodeOptions, ReactFlowNode } from "./types.js"

const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 120

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

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 48,
    ranksep: 72,
    marginx: 24,
    marginy: 24,
  })

  const byId = new Map(doc.nodes.map((n) => [n.id, n]))

  for (const node of doc.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }

  for (const node of doc.nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      g.setParent(node.id, node.parentId)
    }
  }

  for (const edge of doc.edges) {
    if (byId.has(edge.source) && byId.has(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const nodes: ReactFlowNode[] = doc.nodes.map((node) => {
    const laid = g.node(node.id)
    if (!laid) return { ...node, position: { ...node.position } }
    return {
      ...node,
      position: {
        x: laid.x - nodeWidth / 2,
        y: laid.y - nodeHeight / 2,
      },
      style: {
        ...node.style,
        width: nodeWidth,
        height: node.type === "ecp-group" ? Math.max(nodeHeight, laid.height ?? nodeHeight) : nodeHeight,
      },
    }
  })

  return { nodes, edges: doc.edges.map((e) => ({ ...e })) }
}
