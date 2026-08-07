import type { BranchNode, LoopNode, ParallelNode, WorkflowNode } from "@executioncontrolprotocol/types"
import type { ExprValue } from "@executioncontrolprotocol/types"
import { slugify } from "../util/slug.js"
import type { StepBuilder } from "../bindings/step.js"

type NodeInput = StepBuilder | WorkflowNode

function toNode(n: NodeInput): WorkflowNode {
  return "toNode" in n ? n.toNode() : n
}

/**
 * Parallel branches.
 * @category Workflow
 */
export function parallel(
  branches: NodeInput[][],
  options?: { id?: string; label?: string }
): ParallelNode {
  return {
    type: "parallel",
    id: options?.id ?? "parallel-1",
    ...(options?.label ? { label: options.label } : {}),
    branches: branches.map((b) => b.map(toNode)),
  }
}

/**
 * Conditional branch.
 * @category Workflow
 */
export function branch(
  steps: Array<StepBuilder & { when?: ExprValue }>,
  options?: { id?: string; label?: string }
): BranchNode {
  return {
    type: "branch",
    id: options?.id ?? "branch-1",
    ...(options?.label ? { label: options.label } : {}),
    branches: steps.map((s) => {
      const node = toNode(s)
      const stepNode = node.type === "step" || !node.type ? node : undefined
      return {
        ...(s.label ? { label: s.label } : {}),
        when: stepNode?.when ?? { eq: ["", true] },
        steps: [node],
      }
    }),
  }
}

/** Loop options. */
export interface LoopOptions {
  label?: string
  until?: ExprValue
  maxRounds?: number
  id?: string
}

/**
 * Loop until condition.
 * @category Workflow
 */
export function loop(
  options: LoopOptions,
  steps: NodeInput[]
): LoopNode {
  return {
    type: "loop",
    id: options.id ?? slugify(options.label ?? "loop"),
    ...(options.label ? { label: options.label } : {}),
    ...(options.until ? { until: options.until } : {}),
    ...(options.maxRounds !== undefined ? { maxRounds: options.maxRounds } : {}),
    steps: steps.map(toNode),
  }
}
