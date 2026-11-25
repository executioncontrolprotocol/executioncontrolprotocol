import type { Node, StepNode } from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID, isStepNode } from "./io-from-schema.js"
import { isJsonObject } from "./json-schema.js"
import { isExprMarker, isScriptMarker, refPathFromValue } from "./markers.js"
import {
  END_RESULTS_HANDLE,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  loopEndNodeId,
  type ReactFlowEdge,
} from "./types.js"

/**
 * Whole-document output handle, used when a read has no field path.
 * @category App
 */
export const OUTPUT_HANDLE_ID = "output"

/**
 * Synthetic target handle for a step `expr` gate.
 * @category App
 */
export const EXPR_HANDLE_ID = "expr"

const STATE_PREFIX = "state."

/**
 * Collect every step under a node tree (parallel, branch and loop), in document order.
 * @category App
 */
export function collectSteps(nodes: Node[], out: StepNode[]): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      out.push(node)
    } else if (node.type === "parallel") {
      for (const path of node.paths) collectSteps(path, out)
    } else if (node.type === "if") {
      collectSteps(node.then, out)
      if (node.else) collectSteps(node.else, out)
    } else {
      collectSteps(node.steps, out)
    }
  }
}

interface ScopeSegment {
  kind: "if" | "parallel" | "loop"
  id: string
  side?: "then" | "else"
  index?: number
  as?: string
}

interface IfScope {
  id: string
  as?: string
  thenOrder: number
  elseOrder?: number
}

interface ParallelScope {
  id: string
  startOrder: number
  as?: string
}

interface LoopScope {
  id: string
  mode: "while" | "for" | "forEach"
  as: string
  into: string
  bodyStepIds: Set<string>
  startOrder: number
  endOrder: number
  endNodeId: string
}

interface StepPlacement {
  step: StepNode
  order: number
  enclosingLoopStack: string[]
  scope: ScopeSegment[]
}

interface WalkState {
  order: number
  loopStack: string[]
  scope: ScopeSegment[]
  placements: StepPlacement[]
  loopById: Map<string, LoopScope>
  ifById: Map<string, IfScope>
  parallelById: Map<string, ParallelScope>
}

function loopModeOf(node: { mode?: string }): "while" | "for" | "forEach" {
  const mode = node.mode ?? "while"
  return mode === "for" || mode === "forEach" ? mode : "while"
}

function walkPlacements(nodes: Node[], state: WalkState): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      state.placements.push({
        step: node,
        order: state.order++,
        enclosingLoopStack: [...state.loopStack],
        scope: [...state.scope],
      })
    } else if (node.type === "loop") {
      const startOrder = state.order++
      const bodySteps: StepNode[] = []
      collectSteps(node.steps, bodySteps)
      const scope: LoopScope = {
        id: node.id,
        mode: loopModeOf(node),
        as: node.as ?? "",
        into: node.into ?? "",
        bodyStepIds: new Set(bodySteps.map((step) => step.id)),
        startOrder,
        endOrder: startOrder,
        endNodeId: loopEndNodeId(node.id),
      }
      state.loopById.set(node.id, scope)
      state.loopStack.push(node.id)
      walkPlacements(node.steps, state)
      state.loopStack.pop()
      scope.endOrder = state.order++
    } else if (node.type === "parallel") {
      state.parallelById.set(node.id, { id: node.id, startOrder: state.order++, ...(node.as ? { as: node.as } : {}) })
      const asSeg = node.as ? { as: node.as } : {}
      for (let index = 0; index < node.paths.length; index += 1) {
        const path = node.paths[index]!
        state.scope.push({ kind: "parallel", id: node.id, index, ...asSeg })
        walkPlacements(path, state)
        state.scope.pop()
      }
    } else if (node.type === "if") {
      const startOrder = state.order++
      state.ifById.set(node.id, { id: node.id, thenOrder: startOrder, ...(node.as ? { as: node.as } : {}) })
      const asSeg = node.as ? { as: node.as } : {}
      state.scope.push({ kind: "if", id: node.id, side: "then", ...asSeg })
      walkPlacements(node.then, state)
      state.scope.pop()
      if (node.else) {
        const ifScope = state.ifById.get(node.id)
        if (ifScope) ifScope.elseOrder = state.order
        state.scope.push({ kind: "if", id: node.id, side: "else", ...asSeg })
        walkPlacements(node.else, state)
        state.scope.pop()
      }
    }
  }
}

/**
 * Document-order step placements and loop scopes for edge extraction.
 * @category App
 */
export function walkManifestPlacements(nodes: Node[]): {
  placements: StepPlacement[]
  loopById: Map<string, LoopScope>
  ifById: Map<string, IfScope>
  parallelById: Map<string, ParallelScope>
} {
  const state: WalkState = {
    order: 0,
    loopStack: [],
    scope: [],
    placements: [],
    loopById: new Map(),
    ifById: new Map(),
    parallelById: new Map(),
  }
  walkPlacements(nodes, state)
  return {
    placements: state.placements,
    loopById: state.loopById,
    ifById: state.ifById,
    parallelById: state.parallelById,
  }
}

/**
 * Parse `state.<key>[.<rest>]` (or `<key>[.<rest>]`, as `$state` writes it) into the
 * state key and the optional nested field path.
 * @category App
 */
export function parseStateRef(refPath: string): { asKey: string; fieldPath: string } | undefined {
  const normalized = refPath.startsWith(STATE_PREFIX) ? refPath.slice(STATE_PREFIX.length) : refPath
  const parts = normalized.split(".")
  const asKey = parts[0]
  if (!asKey) return undefined
  return { asKey, fieldPath: parts.slice(1).join(".") }
}

function longestPrefixId(path: string, ids: readonly string[] | undefined): string | undefined {
  let best: string | undefined
  for (const id of ids ?? []) {
    if (!id) continue
    if ((path === id || path.startsWith(`${id}.`)) && (!best || id.length > best.length)) {
      best = id
    }
  }
  return best
}

/**
 * Longest output port id that is `fieldPath` or a dotted prefix of it. Falls back to the
 * first path segment, or `output` when the path is empty.
 * @category App
 */
export function longestMatchingPortId(fieldPath: string, portIds?: readonly string[]): string {
  if (!fieldPath) return OUTPUT_HANDLE_ID
  const best = longestPrefixId(fieldPath, portIds)
  if (best) return best
  const first = fieldPath.split(".")[0]
  return first ? first : OUTPUT_HANDLE_ID
}

/**
 * Longest input port id matching `inputPath`, or the full dotted path when none match
 * (so the encoder can create a nested target handle).
 * @category App
 */
export function resolveInputHandle(inputPath: string, portIds?: readonly string[]): string {
  if (!inputPath) return inputPath
  return longestPrefixId(inputPath, portIds) ?? inputPath
}

function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key
}

/**
 * Recursively visit every `$ref` / `$state` in an input value tree, including the
 * `$script.params` of a script marker (reported at the script's own input path).
 * `$expr` and `$script` bodies are not walked; see {@link walkInputExprs}.
 * @category App
 */
export function walkInputRefs(
  value: unknown,
  path: string,
  visit: (inputPath: string, refPath: string, paramKey?: string) => void,
): void {
  const refPath = refPathFromValue(value)
  if (refPath !== undefined) {
    visit(path, refPath)
    return
  }
  if (isExprMarker(value)) return
  if (isScriptMarker(value)) {
    for (const [key, param] of Object.entries(value.$script.params ?? {})) {
      const paramRef = refPathFromValue(param)
      if (paramRef !== undefined) visit(path, paramRef, key)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkInputRefs(item, joinPath(path, String(index)), visit))
    return
  }
  if (isJsonObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) continue
      walkInputRefs(child, joinPath(path, key), visit)
    }
  }
}

/**
 * Recursively visit every `$expr` in an input value tree, including `$expr` values in
 * `$script.params` (reported at the script's own input path).
 * @category App
 */
export function walkInputExprs(
  value: unknown,
  path: string,
  visit: (inputPath: string, source: string) => void,
): void {
  if (isExprMarker(value)) {
    visit(path, value.$expr)
    return
  }
  if (refPathFromValue(value) !== undefined) return
  if (isScriptMarker(value)) {
    for (const param of Object.values(value.$script.params ?? {})) {
      if (isExprMarker(param)) visit(path, param.$expr)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkInputExprs(item, joinPath(path, String(index)), visit))
    return
  }
  if (isJsonObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) continue
      walkInputExprs(child, joinPath(path, key), visit)
    }
  }
}

const ARROW_HEAD = /^(?:async\s+)?(?:\(\s*[A-Za-z_$][\w$]*\s*\)|[A-Za-z_$][\w$]*|\(\s*\))\s*=>\s*/
const PARAM_NAME = /^\s*(?:async\s+)?(?:function\b[^(]*)?\(?\s*([A-Za-z_$][\w$]*)/

/**
 * Short badge text for an `expr` source: whitespace collapsed and, for a concise arrow
 * function, the parameter head dropped (`(state) => state.on` becomes `state.on`).
 * Returns an empty string when there is no expression.
 * @category App
 */
export function formatExprBadge(expr?: string): string {
  if (!expr) return ""
  const compact = expr.replace(/\s+/g, " ").trim()
  const head = ARROW_HEAD.exec(compact)
  if (!head) return compact
  const body = compact.slice(head[0].length)
  return body && !body.startsWith("{") ? body : compact
}

function escapeRegExp(text: string): string {
  return text.replace(/[$]/g, "\\$&")
}

/**
 * State paths an expression source reads, best effort: `<param>.a.b`, `<param>?.a` and
 * `<param>["a"]` accesses on the function's first parameter. Paths are returned without
 * the parameter prefix, deduplicated, in source order.
 * @category App
 */
export function stateReadsFromExpr(source: string): string[] {
  const param = PARAM_NAME.exec(source)?.[1]
  if (!param || param === "function" || param === "async") return []
  const access = new RegExp(
    `(?<![\\w$.])${escapeRegExp(param)}((?:\\??\\.[A-Za-z_$][\\w$]*|(?:\\?\\.)?\\[\\s*(?:"[^"]*"|'[^']*')\\s*\\])+)`,
    "g",
  )
  const segment = /\??\.([A-Za-z_$][\w$]*)|\[\s*(?:"([^"]*)"|'([^']*)')\s*\]/g
  const reads: string[] = []
  // Skip the parameter list itself so `(state) =>` is not read as an access.
  const bodyStart = source.indexOf("=>") >= 0 ? source.indexOf("=>") : source.indexOf("{")
  const body = bodyStart >= 0 ? source.slice(bodyStart) : source
  for (const match of body.matchAll(access)) {
    const parts: string[] = []
    for (const seg of (match[1] ?? "").matchAll(segment)) {
      const name = seg[1] ?? seg[2] ?? seg[3]
      if (name) parts.push(name)
    }
    const path = parts.join(".")
    if (path && !reads.includes(path)) reads.push(path)
  }
  return reads
}

/**
 * First state key an expression reads (`state.doc.title` gives `doc.title`), or
 * `undefined` when it reads none.
 * @category App
 */
export function stateKeyFromExpr(source: string): string | undefined {
  return stateReadsFromExpr(source)[0]
}

interface WriterHit {
  id: string
  order: number
  enclosingLoopId?: string
  /** Every loop enclosing the writer, outermost first. */
  loopStack?: readonly string[]
}

interface SourceIndex {
  resolve(asKey: string, readerId: string, readerOrder?: number, enclosingStack?: string[]): string | undefined
  resolveAtOrder(asKey: string, order: number, enclosingLoopId?: string): string | undefined
  loopIds: ReadonlySet<string>
  loopById: ReadonlyMap<string, LoopScope>
}

function loopItemSourceId(asKey: string, stack: readonly string[], loopById: Map<string, LoopScope>): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const scope = loopById.get(stack[i]!)
    if (!scope) continue
    if (asKey === scope.as) return scope.id
    if (scope.mode === "forEach" && asKey === `${scope.as}Index`) return scope.id
    if (scope.mode === "for" && asKey === scope.as) return scope.id
  }
  return undefined
}

function containerAsSourceId(
  asKey: string,
  scope: ScopeSegment[],
): { nodeId: string; handleId: string } | undefined {
  for (let i = scope.length - 1; i >= 0; i--) {
    const seg = scope[i]!
    if (seg.as !== asKey) continue
    if (seg.kind === "if" && seg.side) {
      return { nodeId: seg.id, handleId: seg.side === "then" ? IF_THEN_HANDLE : IF_ELSE_HANDLE }
    }
    if (seg.kind === "parallel" && seg.index !== undefined) {
      return { nodeId: seg.id, handleId: `${PARALLEL_PATH_HANDLE_PREFIX}${seg.index + 1}` }
    }
  }
  return undefined
}

function buildSourceIndex(
  placements: StepPlacement[],
  loopById: Map<string, LoopScope>,
  acceptsKeys?: ReadonlySet<string>,
  _ifById?: Map<string, IfScope>,
): SourceIndex {
  const orderById = new Map(placements.map((placement) => [placement.step.id, placement.order]))
  const readerStacks = new Map(placements.map((placement) => [placement.step.id, placement.enclosingLoopStack]))
  const globalWriters = new Map<string, WriterHit[]>()
  const bodyWriters = new Map<string, WriterHit[]>()

  for (const placement of placements) {
    const { step, order, enclosingLoopStack } = placement
    if (!step.as) continue
    const enclosingLoopId = enclosingLoopStack.at(-1)
    const hit: WriterHit = {
      id: step.id,
      order,
      ...(enclosingLoopId ? { enclosingLoopId, loopStack: [...enclosingLoopStack] } : {}),
    }
    if (enclosingLoopId) {
      const list = bodyWriters.get(step.as) ?? []
      list.push(hit)
      bodyWriters.set(step.as, list)
    } else {
      const list = globalWriters.get(step.as) ?? []
      list.push(hit)
      globalWriters.set(step.as, list)
    }
  }

  for (const scope of loopById.values()) {
    if (!scope.into) continue
    const list = globalWriters.get(scope.into) ?? []
    list.push({ id: scope.endNodeId, order: scope.endOrder })
    globalWriters.set(scope.into, list)
  }

  function lastBefore(hits: WriterHit[], maxOrder: number, enclosingLoopId?: string): string | undefined {
    const filtered = hits.filter((hit) => {
      if (hit.order >= maxOrder) return false
      if (enclosingLoopId && hit.enclosingLoopId && hit.enclosingLoopId !== enclosingLoopId) return false
      return true
    })
    return filtered.at(-1)?.id
  }

  /**
   * A body writer is visible after its loops when every loop it sits in (that doesn't also enclose the reader) is a
   * `while` / `for` loop the reader comes after; `forEach` body writes stay in the item's scope (spec 03 L3).
   */
  function escapesTo(hit: WriterHit, maxOrder: number, readerStack: readonly string[]): boolean {
    const left = (hit.loopStack ?? []).filter((loopId) => !readerStack.includes(loopId))
    if (left.length === 0) return false
    return left.every((loopId) => {
      const scope = loopById.get(loopId)
      return scope !== undefined && scope.mode !== "forEach" && scope.endOrder < maxOrder
    })
  }

  function resolveAtOrder(
    asKey: string,
    maxOrder: number,
    enclosingLoopId?: string,
    readerStack: readonly string[] = enclosingLoopId ? [enclosingLoopId] : [],
  ): string | undefined {
    if (enclosingLoopId) {
      const body = lastBefore(bodyWriters.get(asKey) ?? [], maxOrder, enclosingLoopId)
      if (body) return body
    }
    const escaped = (bodyWriters.get(asKey) ?? []).filter((hit) => escapesTo(hit, maxOrder, readerStack))
    const global = lastBefore([...(globalWriters.get(asKey) ?? []), ...escaped].sort((a, b) => a.order - b.order), maxOrder)
    if (global) return global
    if (acceptsKeys?.has(asKey)) return EXECUTION_ACCEPTS_NODE_ID
    return undefined
  }

  return {
    resolve(asKey, readerId, readerOrder, enclosingStack) {
      const stack =
        enclosingStack ?? readerStacks.get(readerId) ?? (loopById.has(readerId) ? [] : undefined) ?? []
      const itemLoop = loopItemSourceId(asKey, stack, loopById)
      if (itemLoop) return itemLoop

      const readerScope = placements.find((p) => p.step.id === readerId)?.scope ?? []
      const scoped = containerAsSourceId(asKey, readerScope)
      if (scoped) return scoped.nodeId

      const placementOrder = readerOrder ?? orderById.get(readerId) ?? Number.POSITIVE_INFINITY
      const enclosing = stack.at(-1) ?? (loopById.has(readerId) ? readerId : undefined)
      const resolved = resolveAtOrder(asKey, placementOrder, enclosing, stack)
      if (resolved) return resolved
      const candidates = [
        ...(globalWriters.get(asKey) ?? []),
        ...(enclosing ? (bodyWriters.get(asKey) ?? []).filter((hit) => hit.enclosingLoopId === enclosing) : []),
      ]
      return candidates.map((hit) => hit.id).find((id) => id !== readerId)
    },
    resolveAtOrder(asKey, order, enclosingLoopId) {
      return resolveAtOrder(asKey, order, enclosingLoopId)
    },
    loopIds: new Set(loopById.keys()),
    loopById,
  }
}

interface ReadEdgeInput {
  edges: ReactFlowEdge[]
  seen: Set<string>
  index: SourceIndex
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>
  prefix: string
}

function sourceHandleForLoopRead(
  scope: LoopScope,
  parsed: { asKey: string; fieldPath: string },
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
  wholeFallback?: boolean,
): string {
  if (parsed.asKey === scope.as) {
    return scope.mode === "for" ? LOOP_INDEX_HANDLE : LOOP_ITEM_HANDLE
  }
  if (scope.mode === "forEach" && parsed.asKey === `${scope.as}Index`) return LOOP_INDEX_HANDLE
  if (parsed.asKey === scope.into) return END_RESULTS_HANDLE
  if (wholeFallback) {
    return longestPrefixId(parsed.fieldPath, outputPortIdsByStepId?.get(scope.id)) ?? OUTPUT_HANDLE_ID
  }
  return longestMatchingPortId(parsed.fieldPath, outputPortIdsByStepId?.get(scope.id))
}

function pushReadEdge(
  ctx: ReadEdgeInput,
  readerId: string,
  statePath: string,
  targetHandle: string,
  wholeFallback: boolean,
  readerOrder?: number,
  enclosingStack?: string[],
  bindingPath?: string,
  paramKey?: string,
  readerScope?: ScopeSegment[],
): void {
  const parsed = parseStateRef(statePath)
  if (!parsed) return
  const sourceId = ctx.index.resolve(parsed.asKey, readerId, readerOrder, enclosingStack)
  if (!sourceId || sourceId === readerId) return
  let sourceHandle: string
  if (sourceId === EXECUTION_ACCEPTS_NODE_ID) {
    sourceHandle = parsed.asKey
  } else if (ctx.index.loopIds.has(sourceId)) {
    const scope = ctx.index.loopById.get(sourceId)
    sourceHandle = scope
      ? sourceHandleForLoopRead(scope, parsed, ctx.outputPortIdsByStepId, wholeFallback)
      : LOOP_ITEM_HANDLE
  } else if (sourceId.startsWith("end:")) {
    sourceHandle = END_RESULTS_HANDLE
  } else if (containerAsSourceId(parsed.asKey, readerScope ?? [])) {
    sourceHandle = containerAsSourceId(parsed.asKey, readerScope ?? [])!.handleId
  } else if (wholeFallback) {
    sourceHandle =
      longestPrefixId(parsed.fieldPath, ctx.outputPortIdsByStepId?.get(sourceId)) ?? OUTPUT_HANDLE_ID
  } else {
    sourceHandle = longestMatchingPortId(parsed.fieldPath, ctx.outputPortIdsByStepId?.get(sourceId))
  }
  const key = `${sourceId}|${sourceHandle}|${readerId}|${targetHandle}`
  if (ctx.seen.has(key)) return
  ctx.seen.add(key)
  const safeState = statePath.replace(/[^a-zA-Z0-9._-]/g, "_")
  ctx.edges.push({
    id: `${ctx.prefix}-${sourceId}-${readerId}-${targetHandle}-${safeState}`,
    source: sourceId,
    target: readerId,
    sourceHandle,
    targetHandle,
    data: {
      kind: "data",
      inputPath: targetHandle,
      statePath,
      ...(bindingPath !== undefined ? { bindingPath } : {}),
      ...(paramKey !== undefined ? { paramKey } : {}),
    },
  })
}

/**
 * Which reads {@link pushStructureInputEdges} emits: loop drivers first, then every other structure input (the
 * layout engine is sensitive to edge order, so the two passes keep the historic ordering).
 */
type StructureReadPhase = "loop-drivers" | "others"

function pushStructureInputEdges(
  phase: StructureReadPhase,
  ctx: ReadEdgeInput,
  nodes: Node[],
  loopById: Map<string, LoopScope>,
  ifById: Map<string, IfScope>,
  parallelById: Map<string, ParallelScope>,
  inputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
): void {
  const walk = (list: Node[], loopStack: string[], scope: ScopeSegment[]): void => {
    for (const node of list) {
      if (node.type === "if") {
        const ifScope = ifById.get(node.id)
        const asSeg = node.as ? { as: node.as } : {}
        if (phase === "others" && node.input && ifScope) {
          const portIds = inputPortIdsByStepId?.get(node.id)
          for (const [key, value] of Object.entries(node.input)) {
            walkInputRefs(value, key, (inputPath, refPath, paramKey) => {
              pushReadEdge(
                ctx,
                node.id,
                refPath,
                resolveInputHandle(inputPath, portIds),
                false,
                ifScope.thenOrder + 1,
                loopStack,
                inputPath,
                paramKey,
                scope,
              )
            })
          }
        }
        walk(node.then, loopStack, [...scope, { kind: "if", id: node.id, side: "then", ...asSeg }])
        if (node.else) walk(node.else, loopStack, [...scope, { kind: "if", id: node.id, side: "else", ...asSeg }])
      } else if (node.type === "parallel") {
        const parScope = parallelById.get(node.id)
        if (phase === "others" && node.input && parScope) {
          const portIds = inputPortIdsByStepId?.get(node.id)
          for (const [key, value] of Object.entries(node.input)) {
            walkInputRefs(value, key, (inputPath, refPath, paramKey) => {
              pushReadEdge(
                ctx,
                node.id,
                refPath,
                resolveInputHandle(inputPath, portIds),
                false,
                parScope.startOrder + 1,
                loopStack,
                inputPath,
                paramKey,
                scope,
              )
            })
          }
        }
        const asSeg = node.as ? { as: node.as } : {}
        node.paths.forEach((path, index) => {
          walk(path, loopStack, [...scope, { kind: "parallel", id: node.id, index, ...asSeg }])
        })
      } else if (node.type === "loop") {
        const loopScope = loopById.get(node.id)
        const endId = loopScope?.endNodeId
        const bodyStack = [...loopStack, node.id]
        if (phase === "loop-drivers" && loopScope && node.input) {
          const portIds = inputPortIdsByStepId?.get(node.id)
          for (const [key, value] of Object.entries(node.input)) {
            walkInputRefs(value, key, (inputPath, refPath, paramKey) => {
              const targetHandle =
                loopScope.mode === "forEach" && key === "items"
                  ? LOOP_ITEMS_HANDLE
                  : loopScope.mode === "for" && key === "count"
                    ? LOOP_COUNT_HANDLE
                    : resolveInputHandle(inputPath, portIds)
              pushReadEdge(
                ctx,
                node.id,
                refPath,
                targetHandle,
                false,
                loopScope.startOrder + 1,
                loopStack,
                inputPath,
                paramKey,
                scope,
              )
            })
          }
        }
        if (phase === "others" && loopScope && endId && node.end?.input) {
          const portIds = inputPortIdsByStepId?.get(endId)
          for (const [key, value] of Object.entries(node.end.input)) {
            walkInputRefs(value, key, (inputPath, refPath, paramKey) => {
              pushReadEdge(
                ctx,
                endId,
                refPath,
                resolveInputHandle(inputPath, portIds),
                false,
                loopScope.endOrder,
                bodyStack,
                inputPath,
                paramKey,
                [...scope, { kind: "loop", id: node.id }],
              )
            })
          }
        }
        walk(node.steps, bodyStack, scope)
      }
    }
  }
  walk(nodes, [], [])
}

/**
 * Data edges from step `input` reads: `$ref` / `$state` paths (including nested input
 * paths and `$script.params`).
 * A read resolves to the last earlier step committing that key, else the Inputs node when
 * `acceptsKeys` has it, else any other step committing it (a loop-carried value).
 * @category App
 */
export function extractDataEdges(
  nodes: Node[],
  acceptsKeys?: ReadonlySet<string>,
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
  inputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
): ReactFlowEdge[] {
  const { placements, loopById, ifById, parallelById } = walkManifestPlacements(nodes)
  const ctx: ReadEdgeInput = {
    edges: [],
    seen: new Set(),
    index: buildSourceIndex(placements, loopById, acceptsKeys, ifById),
    ...(outputPortIdsByStepId ? { outputPortIdsByStepId } : {}),
    prefix: "data",
  }
  for (const { step, enclosingLoopStack, scope } of placements) {
    if (!step.input) continue
    const inputPortIds = inputPortIdsByStepId?.get(step.id)
    for (const [name, value] of Object.entries(step.input)) {
      walkInputRefs(value, name, (inputPath, refPath, paramKey) => {
        pushReadEdge(
          ctx,
          step.id,
          refPath,
          resolveInputHandle(inputPath, inputPortIds),
          false,
          undefined,
          enclosingLoopStack,
          inputPath,
          paramKey,
          scope,
        )
      })
    }
  }
  pushStructureInputEdges("loop-drivers", ctx, nodes, loopById, ifById, parallelById, inputPortIdsByStepId)
  pushStructureInputEdges("others", ctx, nodes, loopById, ifById, parallelById, inputPortIdsByStepId)
  return ctx.edges
}
