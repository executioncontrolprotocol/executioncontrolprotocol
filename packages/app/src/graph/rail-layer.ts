import type { Node } from "@executioncontrolprotocol/protocol"
import { isStepNode } from "./io-from-schema.js"
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "./layout.js"
import { nodeBox } from "./tunnel-geometry.js"
import { TREE_END_WIDTH, TREE_JOIN_GAP } from "./tree-layout.js"
import type {
  EndMarkerSide,
  ReactFlowControlData,
  ReactFlowEncodeOptions,
  ReactFlowNode,
  ReactFlowTunnelKind,
} from "./types.js"
import { endMarkerId, IF_ELSE_HANDLE, IF_THEN_HANDLE, PARALLEL_PATH_HANDLE_PREFIX } from "./types.js"

/** Visual stroke width for the main rail tube (pixels). @category App */
export const RAIL_STROKE_WIDTH = 96
/** Padding each side of a row band inside a tube stroke (pixels). @category App */
export const RAIL_TUBE_PADDING = 24

const RAIL_STROKE = "#8b949e"
const RAIL_OPACITY = 0.13
const THEN_STROKE = "#3fb950"
const THEN_OPACITY = 0.2
const ELSE_STROKE = "#f85149"
const ELSE_OPACITY = 0.17
const PATH_STROKE = "#58a6ff"
const PATH_OPACITY = 0.2
const LOOP_STROKE = "#a371f7"
const LOOP_STROKE_OPACITY = 0.6
const LOOP_LABEL = "#c297ff"
const LOOP_SUBTITLE = "#a371f7"
const THEN_LABEL = "#56d364"
const ELSE_LABEL = "#ff7b72"
const PATH_LABEL = "#58a6ff"

const HEADER_OFFSET = 72
const PORT_ROW = 22

/**
 * One stroked path in the rail SVG layer.
 * @category App
 */
export interface RailPathShape {
  /** Discriminator for renderers. */
  kind: "path"
  /** Playwright `data-testid`. */
  testId: string
  /** Semantic tunnel kind. */
  dataKind: ReactFlowTunnelKind
  /** SVG path `d`. */
  d: string
  /** Stroke colour (hex). */
  stroke: string
  /** Stroke opacity (`0`–`1`). */
  strokeOpacity: number
  /** Stroke width in flow pixels. */
  strokeWidth: number
  /** When true, render at reduced opacity (untaken `if` side). */
  dimmed?: boolean
  /** Fill colour for a filled band (side tunnel); omitted for stroked tubes and joins. */
  fill?: string
  /** Fill opacity for a filled band. */
  fillOpacity?: number
  /** Bounding box of a filled band (flow pixels). */
  box?: { x: number; y: number; width: number; height: number }
}

/**
 * Indigo loop region in the rail SVG layer.
 * @category App
 */
export interface RailLoopShape {
  kind: "loop"
  testId: string
  x: number
  y: number
  width: number
  height: number
  rx: number
  stroke: string
  strokeOpacity: number
  strokeWidth: number
  strokeDasharray: string
  title: string
  subtitle: string
  dimmed?: boolean
}

/**
 * Branch label (`then` / `else` / `path N`) in the rail SVG layer.
 * @category App
 */
export interface RailLabelShape {
  kind: "label"
  testId: string
  text: string
  x: number
  y: number
  fill: string
  fontWeight: number
}

/** Union of drawable rail-layer primitives. @category App */
export type RailVisualShape = RailPathShape | RailLoopShape | RailLabelShape

/**
 * Optional run-overlay dimming for untaken `if` sides.
 * @category App
 */
export interface RailLayerDimming {
  /** `if` node id → taken side (`null` = neither). */
  choices: Record<string, "then" | "else" | null>
}

function railMemberIds(
  listNodes: readonly Node[],
  laidNodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): string[] {
  const ids: string[] = []
  const byId = new Map(laidNodes.map((node) => [node.id, node]))
  const addIfPresent = (id: string) => {
    if (byId.has(id)) ids.push(id)
  }
  for (const node of listNodes) {
    addIfPresent(node.id)
    if (node.type === "loop") {
      for (const step of node.steps) {
        if (isStepNode(step)) addIfPresent(step.id)
        else railMemberIds([step], laidNodes, options).forEach((mid) => addIfPresent(mid))
      }
      addIfPresent(endMarkerId(node.id, "loop"))
    }
  }
  return ids
}

function listCentreY(
  memberIds: readonly string[],
  laidNodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
): number | undefined {
  const byId = new Map(laidNodes.map((node) => [node.id, node]))
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  let sum = 0
  let count = 0
  for (const id of memberIds) {
    const node = byId.get(id)
    if (!node || node.type === "ecp-tunnel" || node.type === "ecp-placeholder" || node.type === "ecp-end") continue
    const box = nodeBox(node, nodeWidth, nodeHeight)
    sum += box.y + box.height / 2
    count += 1
  }
  return count > 0 ? sum / count : undefined
}

function rowBandHeight(
  memberIds: readonly string[],
  laidNodes: readonly ReactFlowNode[],
  nodeWidth: number,
  nodeHeight: number,
  centreY?: number,
): number {
  const byId = new Map(laidNodes.map((node) => [node.id, node]))
  let maxH = 0
  for (const id of memberIds) {
    const node = byId.get(id)
    if (!node || node.type === "ecp-tunnel" || node.type === "ecp-placeholder" || node.type === "ecp-end") continue
    const box = nodeBox(node, nodeWidth, nodeHeight)
    if (centreY !== undefined) {
      const cy = box.y + box.height / 2
      if (Math.abs(cy - centreY) > 8) continue
    }
    maxH = Math.max(maxH, box.height)
  }
  return maxH
}

function tubeStrokeWidth(bandHeight: number, fallback: number): number {
  if (bandHeight <= 0) return fallback
  return Math.max(fallback, bandHeight + RAIL_TUBE_PADDING * 2)
}

function mergeXAfterStructure(structureId: string, laidNodes: readonly ReactFlowNode[]): number {
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

function outputHandleY(control: ReactFlowNode, handleId: string, nodeWidth: number, defaultHeight: number): number {
  const box = nodeBox(control, nodeWidth, defaultHeight)
  const data = control.data as ReactFlowControlData
  const inputRows = data.inputs.length
  const outputIndex = Math.max(0, data.outputs.findIndex((port) => port.id === handleId))
  return box.y + HEADER_OFFSET + inputRows * PORT_ROW + outputIndex * PORT_ROW + PORT_ROW / 2
}

function sideStroke(kind: "then" | "else" | "path"): { stroke: string; opacity: number; label: string; labelColor: string } {
  if (kind === "then") return { stroke: THEN_STROKE, opacity: THEN_OPACITY, label: "then", labelColor: THEN_LABEL }
  if (kind === "else") return { stroke: ELSE_STROKE, opacity: ELSE_OPACITY, label: "else", labelColor: ELSE_LABEL }
  return { stroke: PATH_STROKE, opacity: PATH_OPACITY, label: "path", labelColor: PATH_LABEL }
}

function sideHandleId(kind: "then" | "else" | "path", pathIndex?: number): string {
  if (kind === "then") return IF_THEN_HANDLE
  if (kind === "else") return IF_ELSE_HANDLE
  return `${PARALLEL_PATH_HANDLE_PREFIX}${pathIndex ?? 1}`
}

/** Padding (flow pixels) around a side's nodes; grows per nested control level so inner tunnels sit inside. */
export const SIDE_BAND_PADDING = 18
const SIDE_BAND_NEST_STEP = 12
/** Stroke width of a join back to the rail and of a side's neck from its port. */
export const JOIN_RIBBON_WIDTH = 18
const BAND_LEFT_GAP = 0
const BAND_RIGHT_GAP = 12

/** Ids of every laid-out node in a list's subtree, including nested controls' end markers. */
function subtreeIds(list: readonly Node[]): string[] {
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

/** How many control levels a list contains (0 when it holds only steps). */
export function controlNestingDepth(list: readonly Node[]): number {
  let depth = 0
  for (const node of list) {
    if (node.type === "if") depth = Math.max(depth, 1 + Math.max(controlNestingDepth(node.then), controlNestingDepth(node.else ?? [])))
    else if (node.type === "parallel") depth = Math.max(depth, 1 + Math.max(0, ...node.paths.map(controlNestingDepth)))
    else if (node.type === "loop") depth = Math.max(depth, 1 + controlNestingDepth(node.steps))
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

/** SVG path for a rounded rectangle. */
export function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  return [
    `M ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `L ${x + r} ${y + height}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ")
}

/**
 * The filled band of one side: from just right of its control node to just right of its end marker, around every
 * node in the side (nested tunnels included), padded more for each nested control level.
 */
function sideBand(
  control: ReactFlowNode,
  marker: ReactFlowNode,
  sideNodes: readonly Node[],
  byId: ReadonlyMap<string, ReactFlowNode>,
  nodeWidth: number,
  nodeHeight: number,
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
  // The band starts at its first node (less padding); the neck fills the gap from the control's port.
  const x = Math.max(controlBox.x + controlBox.width + BAND_LEFT_GAP, inner.x - pad)
  const right = markerBox.x + markerBox.width + BAND_RIGHT_GAP
  const top = inner.y - pad
  const bottom = inner.bottom + pad
  return { x, y: top, width: Math.max(0, right - x), height: bottom - top }
}

/**
 * One side's tunnel as a single outline: a neck leaves the control's port at ribbon height, curves open to the band's
 * full height, and the band runs on to its rounded right end. Drawn as one shape, so neck and band never double up
 * where they meet. Falls back to a plain rounded band when there is no room for a neck.
 * @category App
 */
export function sideTunnelPath(
  portX: number,
  portY: number,
  band: { x: number; y: number; width: number; height: number },
  radius: number,
): string {
  if (band.x - portX < 2) return roundedRectPath(band.x, band.y, band.width, band.height, radius)
  const half = JOIN_RIBBON_WIDTH / 2
  const right = band.x + band.width
  const r = Math.max(0, Math.min(radius, band.width / 2, band.height / 2))
  const top = band.y
  const bottom = band.y + band.height
  const midX = (portX + band.x) / 2
  return [
    `M ${portX} ${portY - half}`,
    `C ${midX} ${portY - half} ${midX} ${top} ${band.x} ${top}`,
    `L ${right - r} ${top}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `L ${right} ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `L ${band.x} ${bottom}`,
    `C ${midX} ${bottom} ${midX} ${portY + half} ${portX} ${portY + half}`,
    "Z",
  ].join(" ")
}

/** Horizontal inset of a side label from its tunnel's left end (flow pixels). */
const SIDE_LABEL_INSET_X = 24
/** Gap between a side label and its tunnel edge (flow pixels). */
const SIDE_LABEL_GAP = 6
/** Approximate cap height of a side label, so labels below a tunnel clear its edge (flow pixels). */
const SIDE_LABEL_HEIGHT = 10

/** Horizontal length over which a join curves from its side's lane into the tube (flow pixels). */
export const JOIN_CURVE_LENGTH = 72

/**
 * A join drawn as a filled funnel: its left edge spans the side band's full height at the band's right edge, and it
 * narrows with horizontal-tangent curves into the parent row's tube (centre `railY`, half-height `railHalf`) at `mergeX`.
 * @category App
 */
export function joinFunnelPath(
  band: { x: number; y: number; width: number; height: number },
  mergeX: number,
  railY: number,
  railHalf: number,
): string {
  const bx = band.x + band.width
  const top = band.y
  const bottom = band.y + band.height
  const mx = Math.max(mergeX, bx + 1)
  const rt = railY - railHalf
  const rb = railY + railHalf
  const span = mx - bx
  if (span <= JOIN_CURVE_LENGTH * 2) {
    // Short join: one funnel from the band's full height into the tube.
    const dx = span / 2
    return [
      `M ${bx} ${top}`,
      `C ${bx + dx} ${top} ${mx - dx} ${rt} ${mx} ${rt}`,
      `L ${mx} ${rb}`,
      `C ${mx - dx} ${rb} ${bx + dx} ${bottom} ${bx} ${bottom}`,
      "Z",
    ].join(" ")
  }
  // Long join: pinch from the band into a tube on the band's centre line, run level, then curve into the merge.
  const cy = (top + bottom) / 2
  const lt = cy - railHalf
  const lb = cy + railHalf
  const pinchEnd = bx + JOIN_CURVE_LENGTH
  const curveStart = mx - JOIN_CURVE_LENGTH
  const p = JOIN_CURVE_LENGTH / 2
  return [
    `M ${bx} ${top}`,
    `C ${bx + p} ${top} ${pinchEnd - p} ${lt} ${pinchEnd} ${lt}`,
    `L ${curveStart} ${lt}`,
    `C ${curveStart + p} ${lt} ${mx - p} ${rt} ${mx} ${rt}`,
    `L ${mx} ${rb}`,
    `C ${mx - p} ${rb} ${curveStart + p} ${lb} ${curveStart} ${lb}`,
    `L ${pinchEnd} ${lb}`,
    `C ${pinchEnd - p} ${lb} ${bx + p} ${bottom} ${bx} ${bottom}`,
    "Z",
  ].join(" ")
}


function sideDimmed(structureId: string, side: "then" | "else", dimming?: RailLayerDimming): boolean {
  if (!dimming) return false
  const choice = dimming.choices[structureId]
  if (choice === undefined) return false
  return choice !== null && choice !== side
}

function pushPath(
  out: RailVisualShape[],
  testId: string,
  dataKind: ReactFlowTunnelKind,
  d: string,
  stroke: string,
  strokeOpacity: number,
  strokeWidth: number,
  dimmed?: boolean,
): void {
  out.push({
    kind: "path",
    testId,
    dataKind,
    d,
    stroke,
    strokeOpacity,
    strokeWidth,
    dimmed,
  })
}

/**
 * Compute SVG rail, side tubes, joins and loop regions from laid-out nodes.
 * @category App
 */
export function computeRailVisualLayer(
  roots: readonly Node[],
  laidNodes: readonly ReactFlowNode[],
  options?: ReactFlowEncodeOptions,
  io?: { acceptsId?: string; returnsId?: string },
  dimming?: RailLayerDimming,
): RailVisualShape[] {
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const byId = new Map(laidNodes.map((node) => [node.id, node]))
  const out: RailVisualShape[] = []

  const rootMembers: string[] = []
  if (io?.acceptsId && byId.has(io.acceptsId)) rootMembers.push(io.acceptsId)
  for (const node of roots) {
    if (isStepNode(node)) rootMembers.push(node.id)
    else {
      rootMembers.push(node.id)
      if (node.type === "loop") rootMembers.push(endMarkerId(node.id, "loop"))
    }
  }
  if (io?.returnsId && byId.has(io.returnsId)) rootMembers.push(io.returnsId)

  const centreY = listCentreY(rootMembers, laidNodes, options)
  if (centreY === undefined) return out

  const railLeft = (() => {
    const first = rootMembers.map((id) => byId.get(id)).find(Boolean)
    return first ? nodeBox(first, nodeWidth, nodeHeight).x : 0
  })()
  const railRight = (() => {
    const lastId = rootMembers[rootMembers.length - 1]
    const last = lastId ? byId.get(lastId) : undefined
    return last ? nodeBox(last, nodeWidth, nodeHeight).x + nodeBox(last, nodeWidth, nodeHeight).width : railLeft
  })()

  const rootBand = rowBandHeight(rootMembers, laidNodes, nodeWidth, nodeHeight, centreY)
  const rootStroke = tubeStrokeWidth(rootBand, RAIL_STROKE_WIDTH)

  pushPath(out, "ecp-rail-root", "rail", `M ${railLeft} ${centreY} L ${railRight} ${centreY}`, RAIL_STROKE, RAIL_OPACITY, rootStroke)

  // Side labels sit just outside their tunnel (mockup): `then` and `path N` above the band, `else` below it.
  function portLabelAt(
    text: string,
    fill: string,
    testId: string,
    above: boolean,
    band: { x: number; y: number; height: number },
  ): void {
    const labelX = band.x + SIDE_LABEL_INSET_X
    const labelY = above ? band.y - SIDE_LABEL_GAP : band.y + band.height + SIDE_LABEL_GAP + SIDE_LABEL_HEIGHT
    out.push({ kind: "label", testId, text, x: labelX, y: labelY, fill, fontWeight: 700 })
  }

  function pushSideBand(
    shapes: RailVisualShape[],
    structureId: string,
    sideKey: EndMarkerSide,
    dataKind: "then" | "else" | "path",
    control: ReactFlowNode,
    marker: ReactFlowNode,
    sideNodes: readonly Node[],
    handleId: string,
    tone: { stroke: string; opacity: number },
    dimmed: boolean,
  ): void {
    const band = sideBand(control, marker, sideNodes, byId, nodeWidth, nodeHeight)
    const controlBox = nodeBox(control, nodeWidth, nodeHeight)
    shapes.push({
      kind: "path",
      testId: `ecp-side-${structureId}-${sideKey}`,
      dataKind,
      d: sideTunnelPath(controlBox.x + controlBox.width, outputHandleY(control, handleId, nodeWidth, nodeHeight), band, 22),
      stroke: tone.stroke,
      strokeOpacity: Math.min(1, tone.opacity * 2.2),
      strokeWidth: 1.2,
      fill: tone.stroke,
      fillOpacity: tone.opacity,
      box: band,
      dimmed,
    })
  }

  /** Push one join funnel from a side band into the parent row's tube at the merge. */
  function pushJoin(
    shapes: RailVisualShape[],
    testId: string,
    band: { x: number; y: number; width: number; height: number },
    mergeX: number,
    parentCentreY: number,
    control: ReactFlowNode | undefined,
    dimmed: boolean,
  ): void {
    // The parent row's tube is as tall as the control node plus padding (never taller than the side band).
    const controlBox = control ? nodeBox(control, nodeWidth, nodeHeight) : undefined
    const railHalf = Math.min(band.height / 2, (controlBox?.height ?? JOIN_RIBBON_WIDTH * 2) / 2 + SIDE_BAND_PADDING)
    shapes.push({
      kind: "path",
      testId,
      dataKind: "join",
      d: joinFunnelPath(band, mergeX, parentCentreY, railHalf),
      stroke: RAIL_STROKE,
      strokeOpacity: 0,
      strokeWidth: 0,
      fill: RAIL_STROKE,
      fillOpacity: RAIL_OPACITY,
      box: band,
      dimmed,
    })
  }

  function emitJoins(node: Node, parentCentreY: number): void {
    if (node.type === "if") {
      const joinMerge = mergeXAfterStructure(node.id, laidNodes)
      for (const side of ["then", "else"] as const) {
        const markerId = endMarkerId(node.id, side)
        const marker = byId.get(markerId)
        if (!marker) continue
        const dimmed = sideDimmed(node.id, side, dimming)
        const control = byId.get(node.id)
        const sideNodes = side === "then" ? node.then : (node.else ?? [])
        const ifBand =
          control != null
            ? sideBand(control, marker, sideNodes, byId, nodeWidth, nodeHeight)
            : { x: 0, y: 0, width: 0, height: JOIN_RIBBON_WIDTH }
        pushJoin(out, `ecp-join-${node.id}-${side}`, ifBand, joinMerge, parentCentreY, control, dimmed)
        if (control) {
          const tone = sideStroke(side)
          pushSideBand(out, node.id, side, side, control, marker, sideNodes, sideHandleId(side), tone, dimmed)
          portLabelAt(tone.label, tone.labelColor, `ecp-side-label-${node.id}-${side}`, side === "then", ifBand)
        }
      }
      for (const child of [...node.then, ...(node.else ?? [])]) emitJoins(child, parentCentreY)
    } else if (node.type === "parallel") {
      const joinMerge = mergeXAfterStructure(node.id, laidNodes)
      node.paths.forEach((path, index) => {
        const pathKey = `path-${index + 1}` as const
        const markerId = endMarkerId(node.id, pathKey)
        const marker = byId.get(markerId)
        if (!marker) return
        const control = byId.get(node.id)
        const pathBand =
          control != null
            ? sideBand(control, marker, path, byId, nodeWidth, nodeHeight)
            : { x: 0, y: 0, width: 0, height: JOIN_RIBBON_WIDTH }
        pushJoin(out, `ecp-join-${node.id}-${pathKey}`, pathBand, joinMerge, parentCentreY, control, false)
        if (control) {
          const tone = sideStroke("path")
          const handleId = sideHandleId("path", index + 1)
          pushSideBand(out, node.id, pathKey, "path", control, marker, path, handleId, tone, false)
          portLabelAt(`path ${index + 1}`, tone.labelColor, `ecp-side-label-${node.id}-${pathKey}`, true, pathBand)
        }
        for (const child of path) emitJoins(child, parentCentreY)
      })
    } else if (node.type === "loop") {
      const bodyMembers = railMemberIds(node.steps, laidNodes, options)
      const bodyCentre = listCentreY(bodyMembers, laidNodes, options)
      const bodyOnRootRail = Math.abs((bodyCentre ?? parentCentreY) - parentCentreY) < 8
      if (!bodyOnRootRail && bodyMembers.length > 0 && bodyCentre !== undefined) {
        const left = Math.min(
          ...bodyMembers.map((id) => {
            const n = byId.get(id)
            return n ? nodeBox(n, nodeWidth, nodeHeight).x : Infinity
          }),
        )
        const right = Math.max(
          ...bodyMembers.map((id) => {
            const n = byId.get(id)
            return n ? nodeBox(n, nodeWidth, nodeHeight).x + nodeBox(n, nodeWidth, nodeHeight).width : -Infinity
          }),
        )
        const bodyBand = rowBandHeight(bodyMembers, laidNodes, nodeWidth, nodeHeight, bodyCentre)
        const bodyStroke = tubeStrokeWidth(bodyBand, RAIL_STROKE_WIDTH)
        pushPath(
          out,
          `ecp-rail-loop-${node.id}`,
          "rail",
          `M ${left} ${bodyCentre} L ${right} ${bodyCentre}`,
          RAIL_STROKE,
          RAIL_OPACITY,
          bodyStroke,
        )
      }
      for (const child of node.steps) emitJoins(child, bodyCentre ?? parentCentreY)
    }
  }

  for (const node of roots) emitJoins(node, centreY)

  for (const node of laidNodes) {
    if (node.type !== "ecp-tunnel") continue
    const data = node.data as { tunnelKind?: ReactFlowTunnelKind; label?: string; structureId?: string }
    if (data.tunnelKind !== "loop") continue
    const w = typeof node.style?.width === "number" ? node.style.width : 0
    const h = typeof node.style?.height === "number" ? node.style.height : 0
    if (w <= 0 || h <= 0) continue
    const bare = (data.label ?? "loop").replace(/^\s*↻\s*/u, "")
    const title = `↻ ${bare}`
    out.push({
      kind: "loop",
      testId: `ecp-loop-region-${(data.structureId ?? "loop").replace(/:/g, "-")}`,
      x: node.position.x,
      y: node.position.y,
      width: w,
      height: h,
      rx: 16,
      stroke: LOOP_STROKE,
      strokeOpacity: LOOP_STROKE_OPACITY,
      strokeWidth: 1.6,
      strokeDasharray: "7 4",
      title,
      subtitle: "repeats once per item",
    })
    out.push({
      kind: "label",
      testId: `ecp-loop-title-${data.structureId}`,
      text: title,
      x: node.position.x + 16,
      y: node.position.y + 22,
      fill: LOOP_LABEL,
      fontWeight: 700,
    })
    out.push({
      kind: "label",
      testId: `ecp-loop-subtitle-${data.structureId}`,
      text: "repeats once per item",
      x: node.position.x + 16,
      y: node.position.y + 36,
      fill: LOOP_SUBTITLE,
      fontWeight: 400,
    })
  }

  return out
}