import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode } from "@executioncontrolprotocol/protocol"
import { collectAllNodeIds, nodeContainsId } from "./manifest-walk.js"
import {
  boundsAroundNodeIds,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from "./layout.js"
import { tunnelAtFlowPoint } from "./band-placement.js"
import { computeRailVisualLayer, type RailPathShape } from "./rail-layer.js"
import { EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "./io-from-schema.js"
import {
  cloneManifest,
  finalizeManifest,
  locateNode,
  manifestDetached,
  type NodePlacement,
} from "./manifest-walk.js"
import { nodeBox } from "./tunnel-geometry.js"
import { endMarkerId, parseEndMarkerId, type EndMarkerSide, type ReactFlowDocument, type ReactFlowTunnelData } from "./types.js"
import type { StructureEditResult } from "./structure-edit.js"

/** Returned when a marker drag does not cross a node centre. @category App */
export const MARKER_SCOPE_UNCHANGED = "Release without crossing a node boundary"

/** Returned when a node drag has no structural target. @category App */
export const REPARENT_UNCHANGED = "Node stays in the same list"

/** Horizontal centre used to decide which nodes cross an end marker. @category App */
export interface MarkerSnapCenter {
  /** Node id. */
  readonly id: string
  /** Centre x in flow coordinates. */
  readonly centerX: number
}

/**
 * How many nodes sit to the left of `markerX` among crossable side and parent successors.
 * @category App
 */
export function snapMarkerX(
  sideCenters: readonly MarkerSnapCenter[],
  parentCenters: readonly MarkerSnapCenter[],
  markerX: number,
): number {
  const all = [...sideCenters, ...parentCenters]
  all.sort((a, b) => a.centerX - b.centerX)
  let slot = 0
  for (const entry of all) {
    if (markerX > entry.centerX) slot += 1
  }
  return slot
}

function subtreeNodeIds(node: Node): string[] {
  const ids = new Set<string>()
  collectAllNodeIds([node], ids)
  if (node.type === "if" || node.type === "parallel" || node.type === "loop") {
    ids.add(endMarkerId(node.id, node.type === "loop" ? "loop" : "then"))
    if (node.type === "if") ids.add(endMarkerId(node.id, "else"))
    if (node.type === "parallel") {
      node.paths.forEach((_, index) => ids.add(endMarkerId(node.id, `path-${index + 1}`)))
    }
  }
  return [...ids]
}

function crossingCenterX(document: ReactFlowDocument, node: Node): number {
  const box = boundsAroundNodeIds(
    document.nodes,
    subtreeNodeIds(node),
    DEFAULT_NODE_WIDTH,
    DEFAULT_NODE_HEIGHT,
  )
  if (!box) {
    const laid = document.nodes.find((n) => n.id === node.id)
    if (!laid) return 0
    const b = nodeBox(laid, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT)
    return b.x + b.width / 2
  }
  return box.x + box.width / 2
}

function centersFor(document: ReactFlowDocument, nodes: readonly Node[]): MarkerSnapCenter[] {
  return nodes.map((node) => ({ id: node.id, centerX: crossingCenterX(document, node) }))
}

function partitionNodes(
  sideNodes: readonly Node[],
  parentSuccessors: readonly Node[],
  centers: ReadonlyMap<string, number>,
  markerX: number,
): { side: Node[]; parent: Node[] } {
  const onSide = (node: Node): boolean => (centers.get(node.id) ?? 0) < markerX
  const side: Node[] = []
  for (const node of sideNodes) {
    if (onSide(node)) side.push(node)
  }
  for (const node of parentSuccessors) {
    if (onSide(node)) side.push(node)
  }
  const parent: Node[] = []
  for (const node of sideNodes) {
    if (!onSide(node)) parent.push(node)
  }
  for (const node of parentSuccessors) {
    if (!onSide(node)) parent.push(node)
  }
  return { side, parent }
}

function sameIdOrder(a: readonly Node[], b: readonly Node[]): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]!.id !== b[index]!.id) return false
  }
  return true
}

function locateStructure(
  manifest: ExecutionManifest,
  structureId: string,
): { placement: NodePlacement; node: IfNode | ParallelNode | LoopNode } | undefined {
  const hit = locateNode(manifest, structureId)
  if (!hit || hit.node.type === undefined) return undefined
  if (hit.node.type !== "if" && hit.node.type !== "parallel" && hit.node.type !== "loop") return undefined
  return { placement: hit, node: hit.node }
}

function applyPartition(
  manifest: ExecutionManifest,
  structureId: string,
  side: EndMarkerSideList,
  partitioned: { side: Node[]; parent: Node[] },
): ExecutionManifest {
  const located = locateStructure(manifest, structureId)
  if (!located) return manifest
  const { placement, node } = located
  const parentList = placement.parent
  const index = placement.index

  if (node.type === "if") {
    if (side.kind === "then") node.then = partitioned.side
    else node.else = partitioned.side
  } else if (node.type === "parallel") {
    const pathIndex = side.pathIndex ?? 0
    node.paths[pathIndex] = partitioned.side
  } else {
    node.steps = partitioned.side
  }

  parentList.splice(index + 1, parentList.length - index - 1, ...partitioned.parent)
  return manifest
}

interface EndMarkerSideList {
  kind: "then" | "else" | "loop" | "path"
  pathIndex?: number
}

function sideListFor(node: IfNode | ParallelNode | LoopNode, side: EndMarkerSide): {
  sideNodes: Node[]
  sideKey: EndMarkerSideList
} | undefined {
  if (!side) return undefined
  if (node.type === "if") {
    if (side === "then") return { sideNodes: node.then, sideKey: { kind: "then" } }
    if (side === "else") return { sideNodes: node.else ?? [], sideKey: { kind: "else" } }
    return undefined
  }
  if (node.type === "loop") {
    if (side === "loop") return { sideNodes: node.steps, sideKey: { kind: "loop" } }
    return undefined
  }
  if (node.type === "parallel" && side.startsWith("path-")) {
    const parsed = Number.parseInt(side.slice("path-".length), 10)
    const pathIndex = Number.isInteger(parsed) && parsed >= 1 ? parsed - 1 : 0
    return { sideNodes: node.paths[pathIndex] ?? [], sideKey: { kind: "path", pathIndex } }
  }
  return undefined
}

/**
 * Move nodes across an end marker boundary in one manifest edit.
 * @category App
 */
export function applyMarkerSnap(
  manifest: ExecutionManifest,
  markerId: string,
  markerX: number,
  document: ReactFlowDocument,
): StructureEditResult {
  const parsed = parseEndMarkerId(markerId)
  if (!parsed) return { ok: false, reason: MARKER_SCOPE_UNCHANGED }
  const located = locateStructure(manifest, parsed.structureId)
  if (!located) return { ok: false, reason: MARKER_SCOPE_UNCHANGED }
  const sideInfo = sideListFor(located.node, parsed.side)
  if (!sideInfo) return { ok: false, reason: MARKER_SCOPE_UNCHANGED }

  const parentSuccessors = located.placement.parent.slice(located.placement.index + 1)
  const sideCenters = centersFor(document, sideInfo.sideNodes)
  const parentCenters = centersFor(document, parentSuccessors)
  const centerMap = new Map<string, number>()
  for (const entry of [...sideCenters, ...parentCenters]) centerMap.set(entry.id, entry.centerX)

  const partitioned = partitionNodes(sideInfo.sideNodes, parentSuccessors, centerMap, markerX)
  if (sameIdOrder(sideInfo.sideNodes, partitioned.side) && sameIdOrder(parentSuccessors, partitioned.parent)) {
    return { ok: false, reason: MARKER_SCOPE_UNCHANGED }
  }

  const next = cloneManifest(manifest)
  const nextLocated = locateStructure(next, parsed.structureId)
  if (!nextLocated) return { ok: false, reason: MARKER_SCOPE_UNCHANGED }
  const nextSide = sideListFor(nextLocated.node, parsed.side)
  if (!nextSide) return { ok: false, reason: MARKER_SCOPE_UNCHANGED }
  const applied = applyPartition(next, parsed.structureId, nextSide.sideKey, partitioned)
  return finalizeManifest(applied)
}

/**
 * Nodes whose centre will cross when the marker rests at `markerX`.
 * @category App
 */
export function markerSnapHighlight(
  manifest: ExecutionManifest,
  markerId: string,
  markerX: number,
  document: ReactFlowDocument,
): readonly string[] {
  const parsed = parseEndMarkerId(markerId)
  if (!parsed) return []
  const located = locateStructure(manifest, parsed.structureId)
  if (!located) return []
  const sideInfo = sideListFor(located.node, parsed.side)
  if (!sideInfo) return []
  const parentSuccessors = located.placement.parent.slice(located.placement.index + 1)
  const sideCenters = centersFor(document, sideInfo.sideNodes)
  const parentCenters = centersFor(document, parentSuccessors)
  const centerMap = new Map<string, number>()
  for (const entry of [...sideCenters, ...parentCenters]) centerMap.set(entry.id, entry.centerX)

  const current = partitionNodes(sideInfo.sideNodes, parentSuccessors, centerMap, markerX)
  const out = new Set<string>()
  for (const node of current.side) {
    if (!sideInfo.sideNodes.some((n) => n.id === node.id)) out.add(node.id)
  }
  for (const node of current.parent) {
    if (sideInfo.sideNodes.some((n) => n.id === node.id)) out.add(node.id)
  }
  return [...out]
}

function dropDetachedRoot(manifest: ExecutionManifest, detachedId: string): ExecutionManifest | undefined {
  const list = manifest.detached
  if (!Array.isArray(list)) return undefined
  const index = list.findIndex((node) => node.id === detachedId)
  if (index < 0) return undefined
  const nextList = list.filter((_, i) => i !== index)
  if (nextList.length === 0) {
    const rest = { ...manifest }
    delete rest.detached
    return rest
  }
  return { ...manifest, detached: nextList }
}

function insertIndexAtX(document: ReactFlowDocument, children: readonly Node[], x: number): number {
  for (let index = 0; index < children.length; index += 1) {
    const box = boundsAroundNodeIds(
      document.nodes,
      subtreeNodeIds(children[index]!),
      DEFAULT_NODE_WIDTH,
      DEFAULT_NODE_HEIGHT,
    )
    if (box && box.x + box.width / 2 > x) return index
  }
  return children.length
}

function targetChildren(
  manifest: ExecutionManifest,
  tunnel: { tunnelId: string; data: ReactFlowTunnelData },
): { parent: Node[]; atStart?: { kind: "then" | "else" | "loop" | "path"; structureId: string; pathIndex?: number } } | undefined {
  const structure = locateNode(manifest, tunnel.data.structureId)
  if (!structure || structure.node.type === undefined) return undefined
  if (structure.node.type === "if") {
    const side = tunnel.data.tunnelKind === "else" && (structure.node as IfNode).else ? "else" : "then"
    const node = structure.node as IfNode
  const list = side === "else" ? (node.else ??= []) : node.then
    return { parent: list, atStart: { kind: side, structureId: node.id } }
  }
  if (structure.node.type === "parallel") {
    const node = structure.node as ParallelNode
    const parsed = Number.parseInt(tunnel.data.label.replace(/^path\s+/, ""), 10) - 1
    const pathIndex = Number.isInteger(parsed) && parsed >= 0 && parsed < node.paths.length ? parsed : 0
    return { parent: node.paths[pathIndex] ?? [], atStart: { kind: "path", structureId: node.id, pathIndex } }
  }
  if (structure.node.type === "loop") {
    const node = structure.node as LoopNode
    return { parent: node.steps, atStart: { kind: "loop", structureId: node.id } }
  }
  return undefined
}

function sideBandAtPoint(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
): { structureId: string; sideKey: string; tunnelKind: ReactFlowTunnelData["tunnelKind"] } | undefined {
  const shapes = computeRailVisualLayer(manifest.steps, document.nodes)
  let best:
    | { structureId: string; sideKey: string; tunnelKind: ReactFlowTunnelData["tunnelKind"]; area: number }
    | undefined
  for (const shape of shapes) {
    if (shape.kind !== "path") continue
    const band = shape as RailPathShape
    if (!band.box) continue
    if (band.dataKind !== "then" && band.dataKind !== "else" && band.dataKind !== "path") continue
    const { x, y, width, height } = band.box
    if (point.x < x || point.y < y || point.x > x + width || point.y > y + height) continue
    const match = /^ecp-side-([^:]+)-(then|else|path-\d+)$/u.exec(band.testId)
    if (!match) continue
    const area = width * height
    const sideKey = match[2]!
    const tunnelKind: ReactFlowTunnelData["tunnelKind"] = sideKey.startsWith("path-") ? "path" : (sideKey as "then" | "else")
    if (!best || area < best.area) {
      best = { structureId: match[1]!, sideKey, tunnelKind, area }
    }
  }
  if (!best) return undefined
  return { structureId: best.structureId, sideKey: best.sideKey, tunnelKind: best.tunnelKind }
}

function railAtPoint(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
): "root" | { loopId: string } | undefined {
  const shapes = computeRailVisualLayer(manifest.steps, document.nodes)
  for (const shape of shapes) {
    if (shape.kind !== "path" || shape.dataKind !== "rail") continue
    const match = /^M\s+(-?[\d.]+)\s+(-?[\d.]+)\s+L\s+(-?[\d.]+)\s+(-?[\d.]+)$/u.exec(shape.d)
    if (!match || match[2] !== match[4]) continue
    const y = Number.parseFloat(match[2]!)
    const left = Number.parseFloat(match[1]!)
    const right = Number.parseFloat(match[3]!)
    const half = shape.strokeWidth / 2 + 4
    if (point.x >= left && point.x <= right && Math.abs(point.y - y) <= half) {
      if (shape.testId === "ecp-rail-root") return "root"
      const loopMatch = /^ecp-rail-loop-(.+)$/u.exec(shape.testId)
      if (loopMatch) return { loopId: loopMatch[1]! }
    }
  }
  return undefined
}

function structureAfterSideList(manifest: ExecutionManifest, sideList: Node[]): { parent: Node[]; index: number } | undefined {
  const findInRoots = (roots: Node[], parent: Node[]): { parent: Node[]; index: number } | undefined => {
    for (let index = 0; index < roots.length; index += 1) {
      const node = roots[index]!
      if (node.type === "if") {
        if (node.then === sideList) return { parent, index: index + 1 }
        if (node.else === sideList) return { parent, index: index + 1 }
        const inThen = findInRoots(node.then, node.then)
        if (inThen) return inThen
        if (node.else) {
          const inElse = findInRoots(node.else, node.else)
          if (inElse) return inElse
        }
      } else if (node.type === "parallel") {
        for (const path of node.paths) {
          if (path === sideList) return { parent, index: index + 1 }
          const inPath = findInRoots(path, path)
          if (inPath) return inPath
        }
      } else if (node.type === "loop") {
        if (node.steps === sideList) return { parent, index: index + 1 }
        const inBody = findInRoots(node.steps, node.steps)
        if (inBody) return inBody
      }
    }
    return undefined
  }
  const hit = findInRoots(manifest.steps, manifest.steps)
  if (hit) return hit
  const detached = manifestDetached(manifest)
  return detached ? findInRoots(detached, detached) : undefined
}

function listPlacementForTunnel(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
  sideEscalateFrom?: Node[],
): { parent: Node[]; index: number } | undefined {
  const band = sideBandAtPoint(manifest, document, point)
  if (band) {
    const tunnel = tunnelAtFlowPoint(document, point)
    if (tunnel) {
      const target = targetChildren(manifest, tunnel)
      if (target) {
        const index = insertIndexAtX(document, target.parent, point.x)
        return { parent: target.parent, index }
      }
    }
    const hit = locateNode(manifest, band.structureId)
    if (!hit) return undefined
    if (hit.node.type === "if") {
      const node = hit.node
      const list = band.tunnelKind === "else" ? (node.else ??= []) : node.then
      return { parent: list, index: insertIndexAtX(document, list, point.x) }
    }
    if (hit.node.type === "parallel") {
      const node = hit.node
      const pathMatch = /^path-(\d+)$/u.exec(band.sideKey)
      const pathIndex =
        pathMatch && Number.isInteger(Number.parseInt(pathMatch[1]!, 10))
          ? Number.parseInt(pathMatch[1]!, 10) - 1
          : 0
      const list = node.paths[pathIndex] ?? []
      return { parent: list, index: insertIndexAtX(document, list, point.x) }
    }
    if (hit.node.type === "loop") {
      const node = hit.node
      return { parent: node.steps, index: insertIndexAtX(document, node.steps, point.x) }
    }
  }

  const tunnel = tunnelAtFlowPoint(document, point)
  if (tunnel) {
    const target = targetChildren(manifest, tunnel)
    if (!target) return undefined
    return { parent: target.parent, index: insertIndexAtX(document, target.parent, point.x) }
  }

  const rail = railAtPoint(manifest, document, point)
  if (rail === "root") {
    if (sideEscalateFrom && sideEscalateFrom !== manifest.steps) {
      const escalated = structureAfterSideList(manifest, sideEscalateFrom)
      if (escalated) {
        const insert = insertIndexAtX(document, escalated.parent, point.x)
        return { parent: escalated.parent, index: Math.max(escalated.index, insert) }
      }
    }
    return { parent: manifest.steps, index: insertIndexAtX(document, manifest.steps, point.x) }
  }
  if (rail && typeof rail === "object") {
    const loop = locateNode(manifest, rail.loopId)
    if (loop?.node.type === "loop") {
      if (sideEscalateFrom && sideEscalateFrom !== loop.node.steps) {
        const escalated = structureAfterSideList(manifest, sideEscalateFrom)
        if (escalated) {
          const insert = insertIndexAtX(document, escalated.parent, point.x)
          return { parent: escalated.parent, index: Math.max(escalated.index, insert) }
        }
      }
      return { parent: loop.node.steps, index: insertIndexAtX(document, loop.node.steps, point.x) }
    }
  }
  return undefined
}

function detachedRootId(manifest: ExecutionManifest, nodeId: string): string | undefined {
  const detached = manifestDetached(manifest)
  if (!detached) return undefined
  if (detached.some((node) => node.id === nodeId)) return nodeId
  return undefined
}

/**
 * Reparent a dragged node to the list under `point`, or keep placement when unchanged.
 * @category App
 */
export function reparentNodeAtPoint(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  nodeId: string,
  point: { x: number; y: number },
): StructureEditResult {
  if (nodeId === EXECUTION_ACCEPTS_NODE_ID || nodeId === EXECUTION_RETURNS_NODE_ID) {
    return { ok: false, reason: REPARENT_UNCHANGED }
  }
  const current = locateNode(manifest, nodeId)
  if (!current) return { ok: false, reason: REPARENT_UNCHANGED }

  const detachedId = detachedRootId(manifest, nodeId)

  if (!detachedId) {
    const target = listPlacementForTunnel(manifest, document, point, current.parent)
    if (!target) return { ok: false, reason: REPARENT_UNCHANGED }
    if (current.parent === target.parent) {
      return { ok: false, reason: REPARENT_UNCHANGED }
    }
    if (nodeContainsId(current.node, target.parent[0]?.id ?? "")) {
      return { ok: false, reason: REPARENT_UNCHANGED }
    }
  }
  let work = cloneManifest(manifest)
  let nodeToMove: Node | undefined

  if (detachedId) {
    const list = manifest.detached
    if (!Array.isArray(list)) return { ok: false, reason: REPARENT_UNCHANGED }
    const root = list.find((node) => node.id === detachedId)
    if (!root) return { ok: false, reason: REPARENT_UNCHANGED }
    if (list.some((node) => node.id !== detachedId && nodeContainsId(node, detachedId))) {
      return { ok: false, reason: REPARENT_UNCHANGED }
    }
    const without = dropDetachedRoot(work, detachedId)
    if (!without) return { ok: false, reason: REPARENT_UNCHANGED }
    work = without
    nodeToMove = structuredClone(root)
  } else {
    const fresh = locateNode(work, nodeId)
    if (!fresh) return { ok: false, reason: REPARENT_UNCHANGED }
    nodeToMove = structuredClone(fresh.node)
    const removedParent = fresh.parent
    const removedIndex = fresh.index
    fresh.parent.splice(fresh.index, 1)
    const dest = listPlacementForTunnel(work, document, point, removedParent)
    if (!dest) return { ok: false, reason: REPARENT_UNCHANGED }
    let insertAt = dest.index
    if (removedParent === dest.parent && removedIndex < insertAt) insertAt -= 1
    dest.parent.splice(insertAt, 0, nodeToMove)
    return finalizeManifest(work)
  }

  if (!nodeToMove) return { ok: false, reason: REPARENT_UNCHANGED }

  const dest = listPlacementForTunnel(work, document, point)
  if (!dest) return { ok: false, reason: REPARENT_UNCHANGED }
  dest.parent.splice(dest.index, 0, nodeToMove)
  return finalizeManifest(work)
}

/**
 * Band or rail target for highlighting during a node drag.
 * @category App
 */
export function reparentDropTarget(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  point: { x: number; y: number },
): { kind: "band" | "rail" | "tunnel"; testId: string } | undefined {
  const band = sideBandAtPoint(manifest, document, point)
  if (band) return { kind: "band", testId: `ecp-side-${band.structureId}-${band.sideKey}` }
  const tunnel = tunnelAtFlowPoint(document, point)
  if (tunnel) return { kind: "tunnel", testId: tunnel.tunnelId }
  const rail = railAtPoint(manifest, document, point)
  if (rail === "root") return { kind: "rail", testId: "ecp-rail-root" }
  if (rail && typeof rail === "object") return { kind: "rail", testId: `ecp-rail-loop-${rail.loopId}` }
  return undefined
}