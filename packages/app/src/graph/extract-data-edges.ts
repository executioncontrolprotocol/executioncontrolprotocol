import type { Node, StepNode } from "@executioncontrolprotocol/protocol"
import { EXECUTION_ACCEPTS_NODE_ID, isStepNode } from "./io-from-schema.js"
import { isJsonObject } from "./json-schema.js"
import { isExprMarker, isScriptMarker, refPathFromValue } from "./markers.js"
import type { ReactFlowEdge } from "./types.js"

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
      for (const line of node.branches) collectSteps(line, out)
    } else if (node.type === "branch") {
      for (const arm of node.branches) collectSteps(arm.steps, out)
    } else {
      collectSteps(node.steps, out)
    }
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
  visit: (inputPath: string, refPath: string) => void,
): void {
  const refPath = refPathFromValue(value)
  if (refPath !== undefined) {
    visit(path, refPath)
    return
  }
  if (isExprMarker(value)) return
  if (isScriptMarker(value)) {
    for (const param of Object.values(value.$script.params ?? {})) {
      const paramRef = refPathFromValue(param)
      if (paramRef !== undefined) visit(path, paramRef)
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

interface SourceIndex {
  resolve(asKey: string, readerId: string): string | undefined
}

function buildSourceIndex(steps: StepNode[], acceptsKeys?: ReadonlySet<string>): SourceIndex {
  const order = new Map(steps.map((step, index) => [step.id, index]))
  const writers = new Map<string, string[]>()
  for (const step of steps) {
    if (!step.as) continue
    const list = writers.get(step.as) ?? []
    list.push(step.id)
    writers.set(step.as, list)
  }
  return {
    resolve(asKey, readerId) {
      const list = writers.get(asKey) ?? []
      const readerOrder = order.get(readerId) ?? Number.POSITIVE_INFINITY
      const before = list.filter((id) => (order.get(id) ?? 0) < readerOrder)
      if (before.length > 0) return before[before.length - 1]
      if (acceptsKeys?.has(asKey)) return EXECUTION_ACCEPTS_NODE_ID
      return list.find((id) => id !== readerId)
    },
  }
}

interface ReadEdgeInput {
  edges: ReactFlowEdge[]
  seen: Set<string>
  index: SourceIndex
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>
  prefix: string
}

function pushReadEdge(
  ctx: ReadEdgeInput,
  reader: StepNode,
  statePath: string,
  targetHandle: string,
  wholeFallback: boolean,
): void {
  const parsed = parseStateRef(statePath)
  if (!parsed) return
  const sourceId = ctx.index.resolve(parsed.asKey, reader.id)
  if (!sourceId || sourceId === reader.id) return
  let sourceHandle: string
  if (sourceId === EXECUTION_ACCEPTS_NODE_ID) {
    sourceHandle = parsed.asKey
  } else if (wholeFallback) {
    sourceHandle =
      longestPrefixId(parsed.fieldPath, ctx.outputPortIdsByStepId?.get(sourceId)) ?? OUTPUT_HANDLE_ID
  } else {
    sourceHandle = longestMatchingPortId(parsed.fieldPath, ctx.outputPortIdsByStepId?.get(sourceId))
  }
  const key = `${sourceId}|${sourceHandle}|${reader.id}|${targetHandle}`
  if (ctx.seen.has(key)) return
  ctx.seen.add(key)
  const safeState = statePath.replace(/[^a-zA-Z0-9._-]/g, "_")
  ctx.edges.push({
    id: `${ctx.prefix}-${sourceId}-${reader.id}-${targetHandle}-${safeState}`,
    source: sourceId,
    target: reader.id,
    sourceHandle,
    targetHandle,
    data: { kind: "data", inputPath: targetHandle, statePath },
  })
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
  const steps: StepNode[] = []
  collectSteps(nodes, steps)
  const ctx: ReadEdgeInput = {
    edges: [],
    seen: new Set(),
    index: buildSourceIndex(steps, acceptsKeys),
    ...(outputPortIdsByStepId ? { outputPortIdsByStepId } : {}),
    prefix: "data",
  }
  for (const step of steps) {
    if (!step.input) continue
    const inputPortIds = inputPortIdsByStepId?.get(step.id)
    for (const [name, value] of Object.entries(step.input)) {
      walkInputRefs(value, name, (inputPath, refPath) => {
        pushReadEdge(ctx, step, refPath, resolveInputHandle(inputPath, inputPortIds), false)
      })
    }
  }
  return ctx.edges
}

/**
 * Data edges from the state paths a step's `expr` gate reads into its `expr` handle.
 * @category App
 */
export function extractExprEdges(
  nodes: Node[],
  acceptsKeys?: ReadonlySet<string>,
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
): ReactFlowEdge[] {
  const steps: StepNode[] = []
  collectSteps(nodes, steps)
  const ctx: ReadEdgeInput = {
    edges: [],
    seen: new Set(),
    index: buildSourceIndex(steps, acceptsKeys),
    ...(outputPortIdsByStepId ? { outputPortIdsByStepId } : {}),
    prefix: "data-expr",
  }
  for (const step of steps) {
    if (!step.expr) continue
    for (const read of stateReadsFromExpr(step.expr)) {
      pushReadEdge(ctx, step, read, EXPR_HANDLE_ID, true)
    }
  }
  return ctx.edges
}
