import type {
  ExecutionManifest,
  IfNode,
  JsonValue,
  LoopNode,
  Node,
  ParallelNode,
  ValueMarker,
} from "@executioncontrolprotocol/protocol"
import { type ReactFlowControlKind } from "./types.js"
import { cloneManifest, finalizeManifest, freeStateKeyForId, locateNode } from "./manifest-walk.js"
import { STRUCTURE_EDIT_STRUCTURE_NOT_FOUND, setLoopMode, type StructureEditResult } from "./structure-edit.js"
import { IF_DEFAULT_EXPRESSION } from "./panel-edit.js"

/** Refusal when an `if` has no `else` but parallel needs two paths. @category App */
export const KIND_SWITCH_NO_ELSE = "Add a node to else first: a parallel path can't be empty"

/** Refusal when `parallel` has too many paths to become an `if`. @category App */
export const KIND_SWITCH_TOO_MANY_PATHS = "Remove paths until there are two: an if has only then and else"

/** Refusal when a loop cannot become `parallel`. @category App */
export const KIND_SWITCH_LOOP_PARALLEL = "Unwrap the loop, then wrap its nodes in parallel"

/** Control kind shown in the App panel. @category App */
export type ControlPanelKind = ReactFlowControlKind

/** One Kind option and whether it is enabled. @category App */
export interface KindSwitchOption {
  /** Target kind. */
  kind: ControlPanelKind
  /** When false, the dropdown shows the reason. */
  enabled: boolean
  /** Why the switch is disabled, when `enabled` is false. */
  reason?: string
}

const ALL_KINDS: readonly ControlPanelKind[] = ["if", "forEach", "for", "parallel"]

function controlKindOf(node: IfNode | ParallelNode | LoopNode): ControlPanelKind {
  if (node.type === "if") return "if"
  if (node.type === "parallel") return "parallel"
  return node.mode === "for" ? "for" : "forEach"
}

function flattenBody(node: IfNode | ParallelNode): Node[] {
  if (node.type === "if") {
    const body = [...node.then]
    if (node.else) body.push(...node.else)
    return body
  }
  return node.paths.flat()
}

function jsonTypeOf(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined
  const type = (schema as Record<string, unknown>).type
  return typeof type === "string" ? type : undefined
}

function pickDriverKey(
  input: Record<string, unknown> | undefined,
  accepts: Record<string, unknown> | undefined,
  mode: "forEach" | "for",
): string | undefined {
  if (!input) return undefined
  const prefer = mode === "forEach" ? "items" : "count"
  if (input[prefer] !== undefined) return prefer
  for (const key of Object.keys(input)) {
    const prop = accepts?.properties as Record<string, unknown> | undefined
    const type = jsonTypeOf(prop?.[key])
    if (mode === "forEach" && type === "array") return key
    if (mode === "for" && type === "integer") return key
  }
  return undefined
}

/**
 * Disabled Kind options and reasons for the control node panel.
 * @category App
 */
export function kindSwitchAvailability(
  manifest: ExecutionManifest,
  structureId: string,
): KindSwitchOption[] {
  const hit = locateNode(manifest, structureId)
  if (!hit || (hit.node.type !== "if" && hit.node.type !== "parallel" && hit.node.type !== "loop")) {
    return ALL_KINDS.map((kind) => ({ kind, enabled: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }))
  }
  const node = hit.node
  const current = controlKindOf(node)
  return ALL_KINDS.map((kind) => {
    if (kind === current) return { kind, enabled: true }
    if (node.type === "loop" && kind === "parallel") {
      return { kind, enabled: false, reason: KIND_SWITCH_LOOP_PARALLEL }
    }
    if (node.type === "if" && kind === "parallel" && !node.else?.length) {
      return { kind, enabled: false, reason: KIND_SWITCH_NO_ELSE }
    }
    if (node.type === "parallel" && kind === "if" && node.paths.length > 2) {
      return { kind, enabled: false, reason: KIND_SWITCH_TOO_MANY_PATHS }
    }
    return { kind, enabled: true }
  })
}

function loopFromBody(
  manifest: ExecutionManifest,
  id: string,
  body: Node[],
  mode: "forEach" | "for",
  input: Record<string, JsonValue | ValueMarker>,
  label?: string,
): LoopNode {
  const loop: LoopNode = {
    type: "loop",
    id,
    mode,
    as: freeStateKeyForId(manifest, id),
    steps: body,
    input: input as Record<string, JsonValue | ValueMarker>,
  }
  if (label !== undefined) loop.label = label
  if (mode === "forEach") {
    loop.concurrency = 1
    loop.onError = "fail"
  }
  return loop
}

function copyScopedInput(node: IfNode | ParallelNode): Pick<IfNode, "as" | "input" | "accepts"> {
  return {
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(node.input !== undefined ? { input: structuredClone(node.input) } : {}),
    ...(node.accepts !== undefined ? { accepts: structuredClone(node.accepts) } : {}),
  }
}

/**
 * Switch a control node's Kind while keeping its manifest id.
 * @category App
 */
export function switchControlKind(
  manifest: ExecutionManifest,
  structureId: string,
  target: ControlPanelKind,
): StructureEditResult {
  const hit = locateNode(manifest, structureId)
  if (!hit || (hit.node.type !== "if" && hit.node.type !== "parallel" && hit.node.type !== "loop")) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const current = controlKindOf(hit.node)
  if (current === target) return { ok: true, manifest: cloneManifest(manifest) }

  const options = kindSwitchAvailability(manifest, structureId)
  const gate = options.find((row) => row.kind === target)
  if (!gate?.enabled) return { ok: false, reason: gate?.reason ?? "That kind switch is not allowed" }

  const next = cloneManifest(manifest)
  const placement = locateNode(next, structureId)
  if (!placement) return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  const source = placement.node as IfNode | ParallelNode | LoopNode
  const { id, label } = source

  if (source.type === "loop" && (target === "forEach" || target === "for")) {
    return setLoopMode(next, id, target)
  }

  if ((source.type === "if" || source.type === "parallel") && (target === "forEach" || target === "for")) {
    const body = flattenBody(source)
    const scoped = copyScopedInput(source)
    const driverKey = pickDriverKey(scoped.input, scoped.accepts, target)
    const driverInput: Record<string, JsonValue | ValueMarker> = {}
    if (driverKey && scoped.input?.[driverKey] !== undefined) {
      driverInput[target === "forEach" ? "items" : "count"] = scoped.input[driverKey]!
    } else if (target === "for") {
      driverInput.count = 1
    }
    placement.parent[placement.index] = loopFromBody(next, id, body, target, driverInput, label)
    return finalizeManifest(next)
  }

  if (target === "if") {
    let then: Node[]
    let elseSteps: Node[] | undefined
    if (source.type === "loop") {
      then = [...source.steps]
    } else if (source.type === "parallel") {
      then = [...(source.paths[0] ?? [])]
      elseSteps = source.paths[1] ? [...source.paths[1]] : undefined
    } else {
      then = [...source.then]
      elseSteps = source.else ? [...source.else] : undefined
    }
    const nextIf: IfNode = {
      type: "if",
      id,
      expression: IF_DEFAULT_EXPRESSION,
      then,
      ...(elseSteps && elseSteps.length > 0 ? { else: elseSteps } : {}),
    }
    if (label !== undefined) nextIf.label = label
    if (source.type === "if" || source.type === "parallel") {
      const scoped = copyScopedInput(source)
      if (scoped.as !== undefined) {
        nextIf.as = scoped.as
        nextIf.input = scoped.input as IfNode["input"]
        nextIf.accepts = scoped.accepts as IfNode["accepts"]
      }
    }
    if (source.type === "loop") {
      const driver = source.mode === "forEach" ? "items" : "count"
      const value = source.input?.[driver]
      if (value !== undefined) {
        nextIf.input = { [driver]: value }
        nextIf.accepts = {
          type: "object",
          properties: { [driver]: driver === "items" ? { type: "array" } : { type: "integer" } },
        }
      }
    }
    placement.parent[placement.index] = nextIf
    return finalizeManifest(next)
  }

  if (target === "parallel" && source.type === "if") {
    const parallel: ParallelNode = {
      type: "parallel",
      id,
      paths: [[...source.then], [...(source.else ?? [])]],
      ...copyScopedInput(source),
    }
    if (label !== undefined) parallel.label = label
    placement.parent[placement.index] = parallel
    return finalizeManifest(next)
  }

  return { ok: false, reason: "That kind switch is not allowed" }
}