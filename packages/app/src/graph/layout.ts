import dagre from "@dagrejs/dagre"
import type {
  ReactFlowDocument,
  ReactFlowEncodeOptions,
  ReactFlowGroupData,
  ReactFlowIoData,
  ReactFlowNode,
  ReactFlowStepData,
} from "./types.js"

const DEFAULT_NODE_WIDTH = 260
const DEFAULT_NODE_HEIGHT = 160
const PORT_ROW_ESTIMATE = 18
const HEADER_ESTIMATE = 72
const GROUP_PADDING = 28
const GROUP_HEADER = 36

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
  if (node.type === "ecp-group") {
    const data = node.data as ReactFlowGroupData
    const armRows = data.arms?.length ?? 0
    return Math.max(fallback, GROUP_HEADER + armRows * 16)
  }
  return fallback
}

/**
 * After flat dagre layout, size each group around its children and convert
 * child positions to parent-relative coordinates for React Flow nesting.
 */
function nestGroupFrames(nodes: ReactFlowNode[], nodeWidth: number, heights: Map<string, number>): ReactFlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, position: { ...node.position } }]))
  const groups = nodes.filter((node) => node.type === "ecp-group")

  for (const group of groups) {
    const children = nodes.filter((node) => node.parentId === group.id)
    if (children.length === 0) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const child of children) {
      const current = byId.get(child.id)!
      const height = heights.get(child.id) ?? DEFAULT_NODE_HEIGHT
      const width = current.style?.width ?? nodeWidth
      minX = Math.min(minX, current.position.x)
      minY = Math.min(minY, current.position.y)
      maxX = Math.max(maxX, current.position.x + width)
      maxY = Math.max(maxY, current.position.y + height)
    }

    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_PADDING - GROUP_HEADER
    const groupWidth = Math.max(nodeWidth, maxX - minX + GROUP_PADDING * 2)
    const groupHeight = Math.max(
      DEFAULT_NODE_HEIGHT,
      maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER
    )

    const groupNode = byId.get(group.id)!
    groupNode.position = { x: groupX, y: groupY }
    groupNode.style = {
      ...groupNode.style,
      width: groupWidth,
      height: groupHeight,
    }
    heights.set(group.id, groupHeight)

    for (const child of children) {
      const current = byId.get(child.id)!
      current.position = {
        x: current.position.x - groupX,
        y: current.position.y - groupY,
      }
      current.parentId = group.id
      current.extent = "parent"
    }
  }

  // Parents before children so React Flow can resolve nesting.
  const ordered: ReactFlowNode[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    const node = byId.get(group.id)
    if (!node || seen.has(node.id)) continue
    ordered.push(node)
    seen.add(node.id)
  }
  for (const node of nodes) {
    const current = byId.get(node.id)
    if (!current || seen.has(current.id)) continue
    ordered.push(current)
    seen.add(current.id)
  }
  return ordered
}

/**
 * Assign dagre layout positions to nodes (mutates a copy).
 * Group frames are sized around children after the flat layout.
 * @category App
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

  // Layout leaf + io nodes; groups are framed afterward from child bounds.
  for (const node of doc.nodes) {
    if (node.type === "ecp-group") continue
    g.setNode(node.id, { width: nodeWidth, height: heights.get(node.id) ?? nodeHeight })
  }

  for (const edge of doc.edges) {
    if (byId.has(edge.source) && byId.has(edge.target)) {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (source?.type === "ecp-group" || target?.type === "ecp-group") continue
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const laid: ReactFlowNode[] = doc.nodes.map((node) => {
    if (node.type === "ecp-group") {
      return {
        ...node,
        position: { ...node.position },
        style: { ...node.style },
      }
    }
    const laidNode = g.node(node.id)
    const height = heights.get(node.id) ?? nodeHeight
    if (!laidNode) return { ...node, position: { ...node.position } }
    return {
      ...node,
      position: {
        x: laidNode.x - nodeWidth / 2,
        y: laidNode.y - height / 2,
      },
      style: {
        ...node.style,
        width: nodeWidth,
      },
    }
  })

  const nested = nestGroupFrames(laid, nodeWidth, heights)

  return { nodes: nested, edges: doc.edges.map((e) => ({ ...e })) }
}
