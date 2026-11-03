import type { ExprValue, InputValue, StepNode, WorkflowNode } from "@executioncontrolprotocol/core/types"
import { WORKFLOW_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import type { ReactFlowEdge } from "./types.js"

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

/**
 * Collect every step under a workflow node tree (parallel / branch / loop).
 * @category App
 */
export function collectSteps(nodes: WorkflowNode[], out: StepNode[]): void {
  for (const node of nodes) {
    if (isStepNode(node)) {
      out.push(node)
      continue
    }
    if (node.type === "parallel") {
      for (const branch of node.branches) collectSteps(branch, out)
      continue
    }
    if (node.type === "branch") {
      for (const arm of node.branches) collectSteps(arm.steps, out)
      continue
    }
    collectSteps(node.steps, out)
  }
}

function isRefValue(value: InputValue): value is { $ref: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as { $ref: unknown }).$ref === "string"
  )
}

function isStateValue(value: InputValue): value is { $state: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$state" in value &&
    typeof (value as { $state: unknown }).$state === "string"
  )
}

function refPathFromInputValue(value: InputValue): string | undefined {
  if (isRefValue(value)) return value.$ref
  if (isStateValue(value)) return value.$state
  return undefined
}

/** Whole-document output handle when the `$ref` has no field path. */
const OUTPUT_HANDLE_ID = "output"

/** Synthetic target handle for a step `.when()` condition edge. */
export const WHEN_HANDLE_ID = "when"

/**
 * Parse `state.<asKey>[.<rest>]` into as-key and optional nested path for handles.
 * @category App
 */
export function parseStateRef(
  refPath: string
): { asKey: string; fieldPath: string } | undefined {
  const normalized = refPath.startsWith("state.") ? refPath.slice("state.".length) : refPath
  if (!normalized) return undefined
  const parts = normalized.split(".")
  const asKey = parts[0]
  if (!asKey) return undefined
  const fieldPath = parts.slice(1).join(".")
  return { asKey, fieldPath }
}

/**
 * Longest output port id that is `fieldPath` or a dotted prefix of it.
 * Falls back to the first segment (or `output` when the path is empty).
 * @category App
 */
export function longestMatchingPortId(
  fieldPath: string,
  portIds?: readonly string[]
): string {
  if (!fieldPath) return OUTPUT_HANDLE_ID
  let best: string | undefined
  if (portIds) {
    for (const id of portIds) {
      if (!id) continue
      if (fieldPath === id || fieldPath.startsWith(`${id}.`)) {
        if (!best || id.length > best.length) best = id
      }
    }
  }
  if (best) return best
  const first = fieldPath.split(".")[0]
  return first && first.length > 0 ? first : OUTPUT_HANDLE_ID
}

/**
 * Longest input port id matching `inputPath`, or the full dotted path when none match
 * (so the encoder can create a nested target handle).
 * @category App
 */
export function resolveInputHandle(
  inputPath: string,
  portIds?: readonly string[]
): string {
  if (!inputPath) return inputPath
  let best: string | undefined
  if (portIds) {
    for (const id of portIds) {
      if (!id) continue
      if (inputPath === id || inputPath.startsWith(`${id}.`)) {
        if (!best || id.length > best.length) best = id
      }
    }
  }
  return best ?? inputPath
}

/**
 * Recursively visit every `$ref` / `$state` in an input value tree.
 * @category App
 */
export function walkInputRefs(
  value: InputValue,
  path: string,
  visit: (inputPath: string, refPath: string) => void
): void {
  const refPath = refPathFromInputValue(value)
  if (refPath) {
    visit(path, refPath)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkInputRefs(item, path ? `${path}.${index}` : String(index), visit)
    })
    return
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) continue
      walkInputRefs(child as InputValue, path ? `${path}.${key}` : key, visit)
    }
  }
}

/**
 * Short badge text for a step / arm `when` expression.
 * @category App
 */
export function formatWhenBadge(expr: ExprValue): string {
  if ("eq" in expr && Array.isArray(expr.eq)) {
    return `eq(${String(expr.eq[0])}, ${JSON.stringify(expr.eq[1])})`
  }
  if ("neq" in expr && Array.isArray(expr.neq)) {
    return `neq(${String(expr.neq[0])}, ${JSON.stringify(expr.neq[1])})`
  }
  try {
    return JSON.stringify(expr)
  } catch {
    return "when"
  }
}

/**
 * State / accepts key referenced by a `when` expression, when present.
 * @category App
 */
export function stateKeyFromWhenExpr(expr: ExprValue): string | undefined {
  if ("eq" in expr && Array.isArray(expr.eq) && expr.eq[0] !== undefined) {
    return String(expr.eq[0])
  }
  if ("neq" in expr && Array.isArray(expr.neq) && expr.neq[0] !== undefined) {
    return String(expr.neq[0])
  }
  return undefined
}

/**
 * Extract data edges from step `.with()` `$ref` values, including nested paths.
 * `acceptsKeys` maps `state.<key>` refs to the projected Inputs node.
 * `outputPortIdsByStepId` selects the longest matching nested output handle.
 * `inputPortIdsByStepId` selects the longest matching nested input handle.
 * @category App
 */
export function extractDataEdges(
  nodes: WorkflowNode[],
  acceptsKeys?: ReadonlySet<string>,
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>,
  inputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>
): ReactFlowEdge[] {
  const steps: StepNode[] = []
  collectSteps(nodes, steps)

  const asToStepId = new Map<string, string>()
  const stepById = new Map<string, StepNode>()
  for (const step of steps) {
    stepById.set(step.id, step)
    if (step.as) asToStepId.set(step.as, step.id)
  }
  if (acceptsKeys) {
    for (const key of acceptsKeys) {
      if (!asToStepId.has(key)) asToStepId.set(key, WORKFLOW_ACCEPTS_NODE_ID)
    }
  }

  const edges: ReactFlowEdge[] = []
  let edgeIndex = 0

  for (const step of steps) {
    if (!step.input) continue
    for (const [paramName, value] of Object.entries(step.input)) {
      walkInputRefs(value, paramName, (inputPath, refPath) => {
        const parsed = parseStateRef(refPath)
        if (!parsed) return
        let sourceStepId = asToStepId.get(parsed.asKey)
        if (!sourceStepId && stepById.has(parsed.asKey)) {
          sourceStepId = parsed.asKey
        }
        if (!sourceStepId) return

        const sourceHandle =
          sourceStepId === WORKFLOW_ACCEPTS_NODE_ID
            ? parsed.asKey
            : longestMatchingPortId(
                parsed.fieldPath,
                outputPortIdsByStepId?.get(sourceStepId)
              )
        const targetHandle = resolveInputHandle(
          inputPath,
          inputPortIdsByStepId?.get(step.id)
        )
        edges.push({
          id: `data-${edgeIndex++}-${sourceStepId}-${step.id}-${inputPath}`,
          source: sourceStepId,
          target: step.id,
          sourceHandle,
          targetHandle,
          data: { kind: "data" },
        })
      })
    }
  }

  return edges
}

/**
 * Data-style edges from accepts / step outputs into a step's `.when()` gate.
 * @category App
 */
export function extractWhenEdges(
  nodes: WorkflowNode[],
  acceptsKeys?: ReadonlySet<string>
): ReactFlowEdge[] {
  const steps: StepNode[] = []
  collectSteps(nodes, steps)

  const asToStepId = new Map<string, string>()
  for (const step of steps) {
    if (step.as) asToStepId.set(step.as, step.id)
  }
  if (acceptsKeys) {
    for (const key of acceptsKeys) {
      if (!asToStepId.has(key)) asToStepId.set(key, WORKFLOW_ACCEPTS_NODE_ID)
    }
  }

  const edges: ReactFlowEdge[] = []
  let edgeIndex = 0
  for (const step of steps) {
    if (!step.when) continue
    const key = stateKeyFromWhenExpr(step.when)
    if (!key) continue
    const parsed = parseStateRef(key)
    if (!parsed) continue
    const sourceStepId = asToStepId.get(parsed.asKey)
    if (!sourceStepId) continue
    const sourceHandle =
      sourceStepId === WORKFLOW_ACCEPTS_NODE_ID ? parsed.asKey : longestMatchingPortId(parsed.fieldPath)
    edges.push({
      id: `data-when-${edgeIndex++}-${sourceStepId}-${step.id}`,
      source: sourceStepId,
      target: step.id,
      sourceHandle,
      targetHandle: WHEN_HANDLE_ID,
      data: { kind: "data" },
    })
  }
  return edges
}
