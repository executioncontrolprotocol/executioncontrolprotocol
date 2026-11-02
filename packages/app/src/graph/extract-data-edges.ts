import type { InputValue, StepNode, WorkflowNode } from "@executioncontrolprotocol/core/types"
import { WORKFLOW_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import type { ReactFlowEdge } from "./types.js"

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

function collectSteps(nodes: WorkflowNode[], out: StepNode[]): void {
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
 * Extract data edges from step `.with()` `$ref` values.
 * `acceptsKeys` maps `state.<key>` refs to the projected Inputs node.
 * `outputPortIdsByStepId` selects the longest matching nested output handle.
 * @category App
 */
export function extractDataEdges(
  nodes: WorkflowNode[],
  acceptsKeys?: ReadonlySet<string>,
  outputPortIdsByStepId?: ReadonlyMap<string, readonly string[]>
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
      const refPath = refPathFromInputValue(value)
      if (!refPath) continue
      const parsed = parseStateRef(refPath)
      if (!parsed) continue
      let sourceStepId = asToStepId.get(parsed.asKey)
      if (!sourceStepId && stepById.has(parsed.asKey)) {
        sourceStepId = parsed.asKey
      }
      if (!sourceStepId) continue

      const sourceHandle =
        sourceStepId === WORKFLOW_ACCEPTS_NODE_ID
          ? parsed.asKey
          : longestMatchingPortId(
              parsed.fieldPath,
              outputPortIdsByStepId?.get(sourceStepId)
            )
      edges.push({
        id: `data-${edgeIndex++}-${sourceStepId}-${step.id}-${paramName}`,
        source: sourceStepId,
        target: step.id,
        sourceHandle,
        targetHandle: paramName,
        data: { kind: "data" },
      })
    }
  }

  return edges
}
