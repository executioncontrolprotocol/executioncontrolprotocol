import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./layout.js"
import {
  JOIN_RIBBON_WIDTH,
  computeSideBand,
  inputHandleY,
  outputHandleY,
  sourceAttachX,
  targetAttachX,
} from "./rail-geometry.js"
import { computeRailVisualLayer, type RailPathShape } from "./rail-layer.js"
import { readerScope, sourceScope, type ScopeSegment } from "./read-order.js"
import { nodeBox } from "./tunnel-geometry.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import {
  endMarkerId,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  type ReactFlowEncodeOptions,
  type ReactFlowNode,
} from "./types.js"

/** Spacing between branch lanes inside a shared tunnel segment (pixels). @category App */
export const BRANCH_LANE_SPACING = 6

/**
 * One published data edge for routing.
 * @category App
 */
export interface BranchRouteEdge {
  /** Published edge id. */
  id: string
  /** Source node id. */
  source: string
  /** Source handle id. */
  sourceHandle: string
  /** Target node id. */
  target: string
  /** Target handle id. */
  targetHandle: string
}

/**
 * Optional precomputed rail shapes (caller may reuse {@link computeRailVisualLayer}).
 * @category App
 */
export interface BranchRoutingInput {
  /** Top-level manifest steps. */
  roots: readonly Node[]
  /** Laid-out React Flow nodes. */
  laidNodes: readonly ReactFlowNode[]
  /** Data edges to route. */
  edges: readonly BranchRouteEdge[]
  /** Ids of nodes on the detached canvas (plain-bezier fallback). */
  detachedNodeIds?: ReadonlySet<string>
  /** Layout options. */
  options?: ReactFlowEncodeOptions
  /** Manifest (for detached list). */
  manifest?: Pick<ExecutionManifest, "detached">
}

interface PortPoint {
  x: number
  y: number
}

/** One leg of a branch's route: a level run or a smooth curve between two points, on its lane bucket. */
interface RoutePlanSegment {
  kind: "line"
  key: string
  from: PortPoint
  to: PortPoint
}

interface RoutePlan {
  segments: RoutePlanSegment[]
}

function sideFromScope(scope: ScopeSegment[] | undefined): { ifId: string; side: "then" | "else" } | undefined {
  if (!scope) return undefined
  for (let index = scope.length - 1; index >= 0; index -= 1) {
    const segment = scope[index]!
    if (segment.kind === "if" && segment.side) return { ifId: segment.id, side: segment.side }
  }
  return undefined
}

function loopIdFromScope(scope: ScopeSegment[] | undefined): string | undefined {
  if (!scope) return undefined
  for (let index = scope.length - 1; index >= 0; index -= 1) {
    const segment = scope[index]!
    if (segment.kind === "loop") return segment.id
  }
  return undefined
}

function centreYOfNodes(
  ids: readonly string[],
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth: number,
  nodeHeight: number,
): number | undefined {
  let sum = 0
  let count = 0
  for (const id of ids) {
    const node = byId.get(id)
    if (!node || node.type === "ecp-tunnel" || node.type === "ecp-placeholder" || node.type === "ecp-end") continue
    const box = nodeBox(node, nodeWidth, nodeHeight)
    sum += box.y + box.height / 2
    count += 1
  }
  return count > 0 ? sum / count : undefined
}

function railYForList(
  list: readonly Node[],
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth: number,
  nodeHeight: number,
): number | undefined {
  const ids: string[] = []
  for (const node of list) {
    if (isStepNode(node)) ids.push(node.id)
    else {
      ids.push(node.id)
      if (node.type === "loop") ids.push(endMarkerId(node.id, "loop"))
    }
  }
  return centreYOfNodes(ids, byId, nodeWidth, nodeHeight)
}

function isControlTunnelPort(handleId: string): boolean {
  return (
    handleId === IF_THEN_HANDLE ||
    handleId === IF_ELSE_HANDLE ||
    handleId.startsWith(PARALLEL_PATH_HANDLE_PREFIX)
  )
}

function findNodeInTree(nodes: Node[], id: string): Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === "if") {
      const hit = findNodeInTree([...node.then, ...(node.else ?? [])], id)
      if (hit) return hit
    } else if (node.type === "parallel") {
      for (const path of node.paths) {
        const hit = findNodeInTree(path, id)
        if (hit) return hit
      }
    } else if (node.type === "loop") {
      const hit = findNodeInTree(node.steps, id)
      if (hit) return hit
    }
  }
  return undefined
}

function planRoute(
  roots: readonly Node[],
  edge: BranchRouteEdge,
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth: number,
  nodeHeight: number,
): RoutePlan | undefined {
  const sourceNode = byId.get(edge.source)
  const targetNode = byId.get(edge.target)
  if (!sourceNode || !targetNode) return undefined

  const manifestSteps = { steps: [...roots] }
  const sourceScopeChain = sourceScope(manifestSteps, { nodeId: edge.source, handleId: edge.sourceHandle })
  const targetScopeChain = readerScope(manifestSteps, edge.target)
  const targetIfSide = sideFromScope(targetScopeChain)
  const sourceIfSide = sideFromScope(sourceScopeChain)

  const targetY = inputHandleY(targetNode, edge.targetHandle, nodeWidth, nodeHeight)
  const targetX = targetAttachX(targetNode, nodeWidth)

  // Control tunnel port → first node on that side (neck into band, then horizontal).
  if (isControlTunnelPort(edge.sourceHandle)) {
    const control = sourceNode
    if (control.type !== "ecp-if" && control.type !== "ecp-parallel") return undefined
    const ifNode = findNodeInTree([...roots], control.id)
    if (!ifNode) return undefined
    const side =
      edge.sourceHandle === IF_THEN_HANDLE
        ? "then"
        : edge.sourceHandle === IF_ELSE_HANDLE
          ? "else"
          : edge.sourceHandle.startsWith(PARALLEL_PATH_HANDLE_PREFIX)
            ? `path-${Number.parseInt(edge.sourceHandle.slice(PARALLEL_PATH_HANDLE_PREFIX.length), 10)}`
            : undefined
    if (!side) return undefined
    const markerId = endMarkerId(control.id, side as "then" | "else")
    const marker = byId.get(markerId)
    if (!marker) return undefined
  const sideNodes =
      ifNode.type === "if"
        ? side === "then"
          ? ifNode.then
          : (ifNode.else ?? [])
        : ifNode.type === "parallel"
          ? (ifNode.paths[Number.parseInt(side.replace("path-", ""), 10) - 1] ?? [])
          : []
    const band = computeSideBand(control, marker, sideNodes, byId, nodeWidth, nodeHeight)
    const laneRefY = targetY
    // One smooth curve from the port, through the neck, onto the target's lane inside the band.
    const portY = outputHandleY(control, edge.sourceHandle, nodeWidth, nodeHeight)
    const landingY = neckLandingY(band, laneRefY)
    return {
      segments: [
        {
          kind: "line",
          key: `neck:${control.id}:${side}`,
          from: { x: sourceAttachX(control, nodeWidth), y: portY },
          to: { x: targetX, y: landingY },
        },
      ],
    }
  }

  const sourceY = outputHandleY(sourceNode, edge.sourceHandle, nodeWidth, nodeHeight)
  const sourceX = sourceAttachX(sourceNode, nodeWidth)

  // Writer inside an if side, reader after merge on parent rail.
  if (sourceIfSide && (!targetIfSide || targetIfSide.ifId !== sourceIfSide.ifId || targetIfSide.side !== sourceIfSide.side)) {
    const { ifId, side } = sourceIfSide
    const marker = byId.get(endMarkerId(ifId, side))
    const ifNode = findNodeInTree([...roots], ifId)
    const control = byId.get(ifId)
    if (!marker || !ifNode || !control || ifNode.type !== "if") return undefined
    const markerRight = nodeBox(marker, nodeWidth).x + nodeBox(marker, nodeWidth).width
    // Along the side's lane to the tunnel's end, then one smooth curve through the join into the target port. Both
    // parts share a lane bucket, so the branch keeps its lane offset all the way.
    const laneKey = `side:${ifId}:${side}:out`
    return {
      segments: [
        { kind: "line", key: laneKey, from: { x: sourceX, y: sourceY }, to: { x: markerRight, y: sourceY } },
        { kind: "line", key: laneKey, from: { x: markerRight, y: sourceY }, to: { x: targetX, y: targetY } },
      ],
    }
  }

  // Same side tunnel: horizontal lane.
  if (sourceIfSide && targetIfSide && sourceIfSide.ifId === targetIfSide.ifId && sourceIfSide.side === targetIfSide.side) {
    return {
      segments: [
        {
          kind: "line",
          key: `side:${sourceIfSide.ifId}:${sourceIfSide.side}:lane`,
          from: { x: sourceX, y: sourceY },
          to: { x: targetX, y: targetY },
        },
      ],
    }
  }

  // Nested outer else: reader on outer else side, writer on root rail inside loop (branch.ecp.json).
  if (!sourceIfSide && targetIfSide) {
    const { ifId, side } = targetIfSide
    const control = byId.get(ifId)
    const marker = byId.get(endMarkerId(ifId, side))
    const ifNode = findNodeInTree([...roots], ifId)
    if (control && marker && ifNode?.type === "if") {
      const sideNodes = side === "then" ? ifNode.then : (ifNode.else ?? [])
      const band = computeSideBand(control, marker, sideNodes, byId, nodeWidth, nodeHeight)
      const loopId = loopIdFromScope(targetScopeChain)
      const enclosingList = loopId
        ? (findNodeInTree([...roots], loopId) as { type: "loop"; steps: Node[] } | undefined)?.steps ?? [...roots]
        : [...roots]
      const leadY = railYForList(enclosingList, byId, nodeWidth, nodeHeight) ?? sourceY
      return {
        segments: [
          {
            kind: "line",
            key: `rail:lead:${edge.source}->${ifId}`,
            from: { x: sourceX, y: leadY },
            to: { x: band.x + 24, y: leadY },
          },
          {
            kind: "line",
            key: `side:${ifId}:${side}:in`,
            from: { x: band.x + 24, y: sourceY },
            to: { x: targetX, y: targetY },
          },
        ],
      }
    }
  }

  const sourceLoop = loopIdFromScope(sourceScopeChain)
  const targetLoop = loopIdFromScope(targetScopeChain)
  if (sourceLoop && !targetLoop) {
    const loopNode = findNodeInTree([...roots], sourceLoop)
    const loopEnd = byId.get(endMarkerId(sourceLoop, "loop"))
    if (loopNode?.type === "loop" && loopEnd) {
      const loopRailY = railYForList(loopNode.steps, byId, nodeWidth, nodeHeight) ?? sourceY
      const rootRailY = railYForList([...roots], byId, nodeWidth, nodeHeight) ?? targetY
      const loopEndX = nodeBox(loopEnd, nodeWidth).x + nodeBox(loopEnd, nodeWidth).width
      const laneY = loopRailY
      return {
        segments: [
          {
            kind: "line",
            key: `rail:loop-body:${sourceLoop}`,
            from: { x: sourceX, y: laneY },
            to: { x: loopEndX, y: laneY },
          },
          {
            kind: "line",
            key: `rail:root:${sourceLoop}->${edge.target}`,
            from: { x: loopEndX, y: rootRailY },
            to: { x: targetX, y: targetY },
          },
        ],
      }
    }
  }

  // Default: travel along the enclosing list rail centre line.
  const listForRail = loopIdFromScope(sourceScopeChain)
    ? ((findNodeInTree([...roots], loopIdFromScope(sourceScopeChain)!) as { type: "loop"; steps: Node[] } | undefined)?.steps ??
      [...roots])
    : [...roots]
  const railY = railYForList(listForRail, byId, nodeWidth, nodeHeight) ?? (sourceY + targetY) / 2
  const laneY = Math.abs(sourceY - railY) < 12 ? railY : sourceY
  // Branches running along the same rail share one lane bucket, so each gets its own lane and none sits on top of
  // another (two branches from the same port would otherwise overlap and only one could be clicked).
  const railKey = loopIdFromScope(sourceScopeChain) ?? "root"

  return {
    segments: [
      {
        kind: "line",
        key: `rail:${railKey}:${Math.round(laneY)}`,
        from: { x: sourceX, y: laneY },
        to: { x: targetX, y: targetY },
      },
    ],
  }
}

function assignLaneY(segmentKey: string, baseY: number, edgeId: string, buckets: Map<string, { y: number; ids: string[] }>): number {
  let bucket = buckets.get(segmentKey)
  if (!bucket) {
    bucket = { y: baseY, ids: [] }
    buckets.set(segmentKey, bucket)
  }
  if (!bucket.ids.includes(edgeId)) bucket.ids.push(edgeId)
  const index = bucket.ids.indexOf(edgeId)
  const count = bucket.ids.length
  // The bucket only decides each branch's side-by-side offset; the height comes from the point being placed.
  const offset = (index - (count - 1) / 2) * BRANCH_LANE_SPACING
  return baseY + offset
}

function segmentPathD(segment: RoutePlanSegment, edgeId: string, laneBuckets: Map<string, { y: number; ids: string[] }>): string {
  const fromY = assignLaneY(segment.key, segment.from.y, edgeId, laneBuckets)
  const toY = assignLaneY(segment.key, segment.to.y, edgeId, laneBuckets)
  if (Math.abs(fromY - toY) < 0.5 && Math.abs(segment.from.x - segment.to.x) > 4) {
    return `M ${segment.from.x} ${fromY} L ${segment.to.x} ${toY}`
  }
  const midX = (segment.from.x + segment.to.x) / 2
  return `M ${segment.from.x} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${segment.to.x} ${toY}`
}

function concatPath(parts: string[]): string {
  const cleaned = parts.filter((part) => part.length > 0)
  if (cleaned.length === 0) return ""
  let out = cleaned[0]!
  for (let index = 1; index < cleaned.length; index += 1) {
    const next = cleaned[index]!
    const sub = next.replace(/^M\s+[\d.-]+\s+[\d.-]+/, "").trim()
    out = sub ? `${out} ${sub}` : out
  }
  return out
}

/**
 * First endpoint of an SVG path `d` (flow pixels).
 * @category App
 */
export function pathStartPoint(d: string): { x: number; y: number } {
  const match = /^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/u.exec(d.trim())
  if (match) return { x: Number(match[1]), y: Number(match[2]) }
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  return { x: numbers[0] ?? 0, y: numbers[1] ?? 0 }
}

/**
 * Last endpoint of an SVG path `d` (flow pixels).
 * @category App
 */
export function pathEndPoint(d: string): { x: number; y: number } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  return { x: numbers[numbers.length - 2] ?? 0, y: numbers[numbers.length - 1] ?? 0 }
}

function shortConnector(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.hypot(x1 - x2, y1 - y2) < 0.5) return ""
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`
}

/** Horizontal length over which a branch leaves its lane and curves into the target port (flow pixels). */
export const BRANCH_ENTRY_CURVE = 32

/**
 * Pull back the end of a middle path's final level run, so the branch curves into its port over
 * `BRANCH_ENTRY_CURVE` instead of a few pixels (branches bundled side by side then separate visibly before they
 * reach their ports, and each stays clickable).
 */
function easeIntoTarget(middle: string, targetY: number): string {
  const match = /^(.*)\bL\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/s.exec(middle)
  if (!match) return middle
  const before = match[1]!
  const endX = Number(match[2])
  const endY = Number(match[3])
  if (Math.abs(endY - targetY) < 0.5) return middle
  const startX = pathEndPoint(`${before.trim()}`).x
  const pulled = Math.max(startX + 1, endX - BRANCH_ENTRY_CURVE)
  if (pulled >= endX) return middle
  return `${before}L ${pulled} ${endY}`
}

/**
 * Attach true React Flow port positions to a middle-only routed path.
 * @category App
 */
export function composeBranchPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  middle: string,
): string {
  const trimmed = easeIntoTarget(middle.trim(), targetY)
  if (!trimmed) return shortConnector(sourceX, sourceY, targetX, targetY)
  const first = pathStartPoint(trimmed)
  const last = pathEndPoint(trimmed)
  return concatPath([shortConnector(sourceX, sourceY, first.x, first.y), trimmed, shortConnector(last.x, last.y, targetX, targetY)])
}

function neckLandingY(
  band: { y: number; height: number },
  laneY: number,
): number {
  return Math.min(Math.max(laneY, band.y + JOIN_RIBBON_WIDTH), band.y + band.height - JOIN_RIBBON_WIDTH)
}

/**
 * Build middle-only SVG path fragments for tunnel-routed data edges (compose with port positions in the canvas).
 * @category App
 */
export function computeBranchRoutes(input: BranchRoutingInput): Map<string, string> {
  const nodeWidth = input.options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = input.options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const byId = new Map(input.laidNodes.map((node) => [node.id, node]))
  const detached = new Set(input.detachedNodeIds ?? [])
  for (const node of input.manifest?.detached ?? []) {
    detached.add(node.id)
  }
  const out = new Map<string, string>()
  const laneBuckets = new Map<string, { y: number; ids: string[] }>()

  // Two passes: the first fills every lane bucket, the second draws each branch with its final, symmetric lane
  // (in one pass, branches drawn before a bucket filled up would keep a stale lane and overlap later ones).
  for (let pass = 0; pass < 2; pass += 1) {
    out.clear()
    routeEdges(input, byId, detached, nodeWidth, nodeHeight, laneBuckets, out)
  }
  return out
}

function routeEdges(
  input: BranchRoutingInput,
  byId: ReadonlyMap<string, ReactFlowNode>,
  detached: ReadonlySet<string>,
  nodeWidth: number,
  nodeHeight: number,
  laneBuckets: Map<string, { y: number; ids: string[] }>,
  out: Map<string, string>,
): void {
  for (const edge of input.edges) {
    if (detached.has(edge.source) || detached.has(edge.target)) continue
    const plan = planRoute(input.roots, edge, byId, nodeWidth, nodeHeight)
    if (!plan) continue
    const chunks = plan.segments.map((segment) => segmentPathD(segment, edge.id, laneBuckets))
    const d = concatPath(chunks)
    if (d) out.set(edge.id, d)
  }
}

/**
 * Sample a point along an SVG path `d` for edge menu placement (mid-path).
 * @category App
 */
export function pathMidpoint(d: string): { x: number; y: number } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  if (numbers.length >= 4) {
    const mid = Math.floor(numbers.length / 4) * 2
    return { x: numbers[mid]!, y: numbers[mid + 1]! }
  }
  return { x: numbers[0] ?? 0, y: numbers[1] ?? 0 }
}

/**
 * Bounding box of an SVG path from its numeric coordinates (approximate).
 * @category App
 */
export function pathBoundingBox(d: string): { x: number; y: number; width: number; height: number } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    xs.push(numbers[index]!)
    ys.push(numbers[index + 1]!)
  }
  if (xs.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * True when a point lies inside a rail band box (with padding).
 * @category App
 */
export function pointInBox(
  point: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
  pad = 2,
): boolean {
  return (
    point.x >= box.x - pad &&
    point.y >= box.y - pad &&
    point.x <= box.x + box.width + pad &&
    point.y <= box.y + box.height + pad
  )
}

/**
 * Return filled side / rail band boxes from the rail layer (for tests).
 * @category App
 */
export function railBandBoxes(
  roots: readonly Node[],
  laidNodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): RailPathShape[] {
  return computeRailVisualLayer(roots, laidNodes, options, { acceptsId: EXECUTION_ACCEPTS_NODE_ID }).filter(
    (shape): shape is RailPathShape => shape.kind === "path" && shape.box !== undefined,
  )
}