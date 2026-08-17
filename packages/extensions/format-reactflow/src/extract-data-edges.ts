import type { InputValue, StepNode, WorkflowNode } from "@executioncontrolprotocol/types"
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

/**
 * Parse `state.<asKey>[.<rest>]` into as-key and optional nested path for handles.
 * @category Encoding
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
 * Extract data edges from step `.with()` `$ref` values.
 * `acceptsKeys` maps `state.<key>` refs to the projected Inputs node.
 * @category Encoding
 */
export function extractDataEdges(
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
    if (!step.input) continue
    for (const [paramName, value] of Object.entries(step.input)) {
      if (!isRefValue(value)) continue
      const parsed = parseStateRef(value.$ref)
      if (!parsed) continue
      const sourceStepId = asToStepId.get(parsed.asKey)
      if (!sourceStepId) continue

      const sourceHandle =
        sourceStepId === WORKFLOW_ACCEPTS_NODE_ID
          ? parsed.asKey
          : parsed.fieldPath
            ? parsed.fieldPath.split(".")[0]
            : "output"
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
