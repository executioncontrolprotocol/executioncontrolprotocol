import type {
  StepNode,
  StepRunRecord,
  WorkflowManifest,
  WorkflowNode,
} from "../types/index.js"

/**
 * Flatten leaf steps in document-order DFS.
 * @category Runtime
 */
export function flattenStepOrder(nodes: WorkflowNode[]): StepNode[] {
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
 * Find a leaf step by id in document order.
 * @category Runtime
 */
export function findStep(workflow: WorkflowManifest, stepId: string): StepNode | undefined {
  return flattenStepOrder(workflow.steps).find((s) => s.id === stepId)
}

/**
 * Canonical JSON of a leaf step used for rerun compatibility checks.
 * @category Runtime
 */
export function canonicalStepDefinition(step: StepNode): string {
  return JSON.stringify({
    id: step.id,
    uses: step.uses,
    input: step.input ?? null,
    as: step.as ?? null,
    when: step.when ?? null,
    mode: step.mode ?? null,
  })
}

/**
 * Clear history and `.as` state keys for steps after `stepId`.
 * @category Runtime
 */
export function clearDownstreamState(
  workflow: WorkflowManifest,
  state: Record<string, unknown>,
  history: Record<string, StepRunRecord>,
  stepId: string
): void {
  clearStepsFrom(workflow, state, history, stepId, 1)
}

/**
 * Clear history and `.as` keys from `stepId` inclusive through the end.
 * @category Runtime
 */
export function clearFromStep(
  workflow: WorkflowManifest,
  state: Record<string, unknown>,
  history: Record<string, StepRunRecord>,
  stepId: string
): void {
  clearStepsFrom(workflow, state, history, stepId, 0)
}

function clearStepsFrom(
  workflow: WorkflowManifest,
  state: Record<string, unknown>,
  history: Record<string, StepRunRecord>,
  stepId: string,
  offset: number
): void {
  const order = flattenStepOrder(workflow.steps)
  const idx = order.findIndex((s) => s.id === stepId)
  if (idx < 0) {
    throw new Error(`Unknown step id: ${stepId}`)
  }
  for (let i = idx + offset; i < order.length; i++) {
    const step = order[i]!
    delete history[step.id]
    if (step.as !== undefined) {
      delete state[step.as]
    }
  }
}

/**
 * Whether `stepId` is the last leaf step in document order.
 * @category Runtime
 */
export function isLastStep(workflow: WorkflowManifest, stepId: string): boolean {
  const order = flattenStepOrder(workflow.steps)
  return order.length > 0 && order[order.length - 1]!.id === stepId
}
