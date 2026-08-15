import type {
  StepNode,
  StepRunRecord,
  WorkflowManifest,
  WorkflowNode,
} from "@executioncontrolprotocol/types"

/**
 * Flatten leaf steps in document-order DFS (test order).
 * @category Test
 */
export function flattenTestStepOrder(nodes: WorkflowNode[]): StepNode[] {
  const out: StepNode[] = []
  const walk = (list: WorkflowNode[]): void => {
    for (const node of list) {
      if (node.type === "parallel") {
        for (const branch of node.branches) walk(branch)
      } else if (node.type === "branch") {
        for (const b of node.branches) walk(b.steps)
      } else if (node.type === "loop") {
        walk(node.steps)
      } else {
        out.push(node as StepNode)
      }
    }
  }
  walk(nodes)
  return out
}

/**
 * Find a leaf step by id in test order.
 * @category Test
 */
export function findTestStep(
  workflow: WorkflowManifest,
  stepId: string
): StepNode | undefined {
  return flattenTestStepOrder(workflow.steps).find((s) => s.id === stepId)
}

/**
 * Clear history and `.as` state keys for steps after `stepId` in test order.
 * Does not modify the target step or earlier steps.
 * @category Test
 */
export function clearDownstreamTestState(
  workflow: WorkflowManifest,
  state: Record<string, unknown>,
  history: Record<string, StepRunRecord>,
  stepId: string
): void {
  const order = flattenTestStepOrder(workflow.steps)
  const idx = order.findIndex((s) => s.id === stepId)
  if (idx < 0) {
    throw new Error(`Unknown step id for test clear-downstream: ${stepId}`)
  }
  for (let i = idx + 1; i < order.length; i++) {
    const step = order[i]!
    delete history[step.id]
    if (step.as !== undefined) {
      delete state[step.as]
    }
  }
}

/**
 * Whether `stepId` is the last leaf step in test order.
 * @category Test
 */
export function isLastTestStep(workflow: WorkflowManifest, stepId: string): boolean {
  const order = flattenTestStepOrder(workflow.steps)
  return order.length > 0 && order[order.length - 1]!.id === stepId
}
