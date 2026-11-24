import type { Node } from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import { isStepNode } from "./io-from-schema.js"
import {
  LOOP_INTO_HANDLE,
  LOOP_ITEM_HANDLE,
} from "./types.js"
import { walkManifestPlacements } from "./extract-data-edges.js"

/**
 * Source port on the graph for read-order checks.
 * @category App
 */
export interface ConnectionSource {
  /** Node id (step, loop, or Inputs). */
  nodeId: string
  /** Handle id on that node. */
  handleId: string
}

interface ScopeSegment {
  kind: "parallel" | "branch" | "loop"
  id: string
  index?: number
}

interface StepWalkEntry {
  order: number
  enclosingLoopStack: string[]
  scope: ScopeSegment[]
}

interface StructureBounds {
  id: string
  kind: "parallel" | "branch" | "loop"
  mode?: "while" | "for" | "forEach"
  startOrder: number
  endOrder: number
  scope: ScopeSegment[]
}

interface WalkIndex {
  steps: Map<string, StepWalkEntry>
  structures: Map<string, StructureBounds>
}

function walkIndex(nodes: Node[]): WalkIndex {
  const steps = new Map<string, StepWalkEntry>()
  const structures = new Map<string, StructureBounds>()
  let order = 0

  const walk = (list: Node[], scope: ScopeSegment[], loopStack: string[]): void => {
    for (const node of list) {
      if (isStepNode(node)) {
        steps.set(node.id, { order: order++, enclosingLoopStack: [...loopStack], scope: [...scope] })
      } else if (node.type === "loop") {
        const startOrder = order++
        const mode = node.mode ?? "while"
        const loopScope: ScopeSegment = { kind: "loop", id: node.id }
        walk(node.steps, [...scope, loopScope], [...loopStack, node.id])
        const endOrder = order++
        structures.set(node.id, {
          id: node.id,
          kind: "loop",
          mode: mode === "for" || mode === "forEach" ? mode : "while",
          startOrder,
          endOrder,
          scope: [...scope],
        })
      } else if (node.type === "parallel") {
        const startOrder = order
        node.branches.forEach((line, index) => {
          walk(line, [...scope, { kind: "parallel", id: node.id, index }], loopStack)
        })
        structures.set(node.id, {
          id: node.id,
          kind: "parallel",
          startOrder,
          endOrder: order,
          scope: [...scope],
        })
      } else if (node.type === "branch") {
        const startOrder = order
        node.branches.forEach((arm, index) => {
          walk(arm.steps, [...scope, { kind: "branch", id: node.id, index }], loopStack)
        })
        structures.set(node.id, {
          id: node.id,
          kind: "branch",
          startOrder,
          endOrder: order,
          scope: [...scope],
        })
      }
    }
  }

  walk(nodes, [], [])
  return { steps, structures }
}

function divergedAtSiblingScope(writer: StepWalkEntry, reader: StepWalkEntry): boolean {
  const w = writer.scope
  const r = reader.scope
  const depth = Math.min(w.length, r.length)
  for (let index = 0; index < depth; index += 1) {
    const left = w[index]!
    const right = r[index]!
    if (left.kind !== right.kind || left.id !== right.id) return false
    if (left.index !== undefined && right.index !== undefined && left.index !== right.index) return true
  }
  return false
}

function forEachBodyLeak(writer: StepWalkEntry, reader: StepWalkEntry, structures: Map<string, StructureBounds>): boolean {
  for (let depth = writer.scope.length; depth > 0; depth -= 1) {
    const segment = writer.scope[depth - 1]
    if (!segment || segment.kind !== "loop") continue
    const loop = structures.get(segment.id)
    if (!loop || loop.mode !== "forEach") continue
    const writerInside = writer.scope.length >= depth
    const readerInside = reader.scope.length >= depth && reader.scope[depth - 1]?.id === segment.id
    if (writerInside && !readerInside && reader.order > loop.endOrder) return true
  }
  return false
}

/**
 * Whether `source` state is visible when read by `targetStepId` under L3 scope rules.
 * @category App
 */
export function sourceVisibleTo(
  manifest: { steps: Node[] },
  source: ConnectionSource,
  targetStepId: string,
): boolean {
  const index = walkIndex(manifest.steps)
  const { loopById } = walkManifestPlacements(manifest.steps)

  if (source.nodeId === EXECUTION_ACCEPTS_NODE_ID) {
    return index.steps.has(targetStepId)
  }

  if (source.nodeId === targetStepId && source.handleId !== LOOP_ITEM_HANDLE && source.handleId !== LOOP_INTO_HANDLE) {
    return false
  }

  const loopAsSource = loopById.has(source.nodeId)
  if (loopAsSource) {
    const reader = index.steps.get(targetStepId)
    if (!reader) return false
    if (source.handleId === LOOP_ITEM_HANDLE) {
      return reader.enclosingLoopStack.includes(source.nodeId)
    }
    if (source.handleId === LOOP_INTO_HANDLE) {
      const loop = loopById.get(source.nodeId)
      if (!loop) return false
      return reader.order > loop.endOrder && !reader.enclosingLoopStack.includes(source.nodeId)
    }
    return false
  }

  const writer = index.steps.get(source.nodeId)
  const reader = index.steps.get(targetStepId)
  if (!writer || !reader) return false
  if (reader.order <= writer.order) return false
  if (divergedAtSiblingScope(writer, reader)) return false
  if (forEachBodyLeak(writer, reader, index.structures)) return false
  return true
}

/**
 * Reason returned when a data connection is refused for document order / scope.
 * @category App
 */
export const CONNECTION_EDIT_ORDER = "That output is not produced before this step"

/**
 * Reason returned when a step would read its own output.
 * @category App
 */
export const CONNECTION_EDIT_SELF = "A step cannot read its own output"

/**
 * Reason returned when a handle cannot accept connections.
 * @category App
 */
export const CONNECTION_EDIT_HANDLE = "That port cannot be connected"