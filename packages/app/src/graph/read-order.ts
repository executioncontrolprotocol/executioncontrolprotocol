import type { Node } from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import { isStepNode } from "./io-from-schema.js"
import {
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  structureEndNodeId,
} from "./types.js"

/**
 * Source port on the graph for read-order checks.
 * @category App
 */
export interface ConnectionSource {
  /** Node id (step, loop, end, if, or Inputs). */
  nodeId: string
  /** Handle id on that node. */
  handleId: string
}

interface ScopeSegment {
  kind: "parallel" | "if" | "loop"
  id: string
  side?: "then" | "else"
  index?: number
}

/**
 * Where a reader (a step, an `if`, a `parallel`, a loop driver or a loop `end`) sits in document order. Steps and loop
 * ends use whole numbers; `if` / `parallel` readers sit half a step before their first inner node.
 */
interface StepWalkEntry {
  order: number
  enclosingLoopStack: string[]
  scope: ScopeSegment[]
}

interface StructureBounds {
  id: string
  kind: "parallel" | "if" | "loop"
  mode?: "for" | "forEach"
  startOrder: number
  endOrder: number
  scope: ScopeSegment[]
}

interface WalkIndex {
  /** Every reader by React Flow node id: steps, `if`, `parallel`, loops (the driver) and `end:<loopId>`. */
  readers: Map<string, StepWalkEntry>
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
        const mode = node.mode
        const loopScope: ScopeSegment = { kind: "loop", id: node.id }
        steps.set(node.id, { order: startOrder, enclosingLoopStack: [...loopStack], scope: [...scope] })
        walk(node.steps, [...scope, loopScope], [...loopStack, node.id])
        const endOrder = order++
        steps.set(structureEndNodeId(node.id), {
          order: endOrder,
          enclosingLoopStack: [...loopStack, node.id],
          scope: [...scope, loopScope],
        })
        structures.set(node.id, {
          id: node.id,
          kind: "loop",
          mode: mode === "for" || mode === "forEach" ? mode : undefined,
          startOrder,
          endOrder,
          scope: [...scope],
        })
      } else if (node.type === "parallel") {
        const startOrder = order
        steps.set(node.id, { order: startOrder - 0.5, enclosingLoopStack: [...loopStack], scope: [...scope] })
        node.paths.forEach((path, index) => {
          walk(path, [...scope, { kind: "parallel", id: node.id, index }], loopStack)
        })
        structures.set(node.id, {
          id: node.id,
          kind: "parallel",
          startOrder,
          endOrder: order,
          scope: [...scope],
        })
      } else if (node.type === "if") {
        const startOrder = order
        steps.set(node.id, { order: startOrder - 0.5, enclosingLoopStack: [...loopStack], scope: [...scope] })
        walk(node.then, [...scope, { kind: "if", id: node.id, side: "then" }], loopStack)
        if (node.else) {
          walk(node.else, [...scope, { kind: "if", id: node.id, side: "else" }], loopStack)
        }
        structures.set(node.id, {
          id: node.id,
          kind: "if",
          startOrder,
          endOrder: order,
          scope: [...scope],
        })
      }
    }
  }

  walk(nodes, [], [])
  return { readers: steps, structures }
}

function divergedAtSiblingScope(writer: StepWalkEntry, reader: StepWalkEntry): boolean {
  const w = writer.scope
  const r = reader.scope
  const depth = Math.min(w.length, r.length)
  for (let index = 0; index < depth; index += 1) {
    const left = w[index]!
    const right = r[index]!
    if (left.kind !== right.kind || left.id !== right.id) return false
    if (left.kind === "if" && left.side !== right.side) return true
    if (left.index !== undefined && right.index !== undefined && left.index !== right.index) return true
  }
  return false
}

/** Whether the reader sits inside the band of an `if` side or `parallel` path. */
function insideBand(reader: StepWalkEntry, structureId: string, match: (segment: ScopeSegment) => boolean): boolean {
  return reader.scope.some((segment) => segment.id === structureId && match(segment))
}

/**
 * Whether `source` state is visible when read by `targetStepId` under L3 scope rules. The reader is any node that has
 * input ports: a step, an `if`, a `parallel`, a loop (its driver) or a loop `end` (`end:<loopId>`).
 * @category App
 */
export function sourceVisibleTo(
  manifest: { steps: Node[] },
  source: ConnectionSource,
  targetStepId: string,
): boolean {
  const index = walkIndex(manifest.steps)
  const reader = index.readers.get(targetStepId)

  if (source.nodeId === EXECUTION_ACCEPTS_NODE_ID) {
    return reader !== undefined
  }

  if (source.nodeId === targetStepId && source.handleId !== LOOP_ITEM_HANDLE) {
    return false
  }

  const sourceLoop = index.structures.get(source.nodeId)
  if (sourceLoop?.kind === "loop") {
    if (!reader) return false
    if (source.handleId === LOOP_ITEM_HANDLE || source.handleId === LOOP_INDEX_HANDLE) {
      return reader.enclosingLoopStack.includes(source.nodeId)
    }
    return false
  }

  const container = index.structures.get(source.nodeId)
  if (container?.kind === "if") {
    if (!reader) return false
    const side = source.handleId === IF_THEN_HANDLE ? "then" : source.handleId === IF_ELSE_HANDLE ? "else" : undefined
    if (!side) return false
    return insideBand(reader, source.nodeId, (segment) => segment.kind === "if" && segment.side === side)
  }
  if (container?.kind === "parallel") {
    if (!reader || !source.handleId.startsWith(PARALLEL_PATH_HANDLE_PREFIX)) return false
    const pathIndex = Number.parseInt(source.handleId.slice(PARALLEL_PATH_HANDLE_PREFIX.length), 10) - 1
    if (!Number.isInteger(pathIndex) || pathIndex < 0) return false
    return insideBand(reader, source.nodeId, (segment) => segment.kind === "parallel" && segment.index === pathIndex)
  }

  const writer = index.readers.get(source.nodeId)
  if (!writer || !reader) return false
  if (reader.order <= writer.order) return false
  if (divergedAtSiblingScope(writer, reader)) return false
  return true
}

/**
 * Reason returned when a data connection is refused for document order / scope.
 * @category App
 */
export const CONNECTION_EDIT_ORDER = "That output is not produced before this node"

/**
 * Reason returned when a node would read its own output.
 * @category App
 */
export const CONNECTION_EDIT_SELF = "A node cannot read its own output"

/**
 * Reason returned when a handle cannot accept connections.
 * @category App
 */
export const CONNECTION_EDIT_HANDLE = "That port cannot be connected"