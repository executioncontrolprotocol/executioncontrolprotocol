import type {
  BranchNode,
  CommitMode,
  LoopNode,
  ParallelNode,
  StepNode,
  WorkflowManifest,
  WorkflowNode,
} from "@executioncontrolprotocol/types"

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted = Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = obj[key]
        return acc
      },
      {} as Record<string, unknown>
    )
  return sorted as T
}

function normalizeInputValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(normalizeInputValue)
  if ("$ref" in value && typeof (value as { $ref: string }).$ref === "string") {
    return { $ref: (value as { $ref: string }).$ref }
  }
  if ("$state" in value && typeof (value as { $state: string }).$state === "string") {
    return { $state: (value as { $state: string }).$state }
  }
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = normalizeInputValue(obj[key])
  }
  return out
}

function normalizeExpr(expr: unknown): unknown {
  if (expr === null || typeof expr !== "object") return expr
  const obj = expr as Record<string, unknown>
  if ("eq" in obj && Array.isArray(obj.eq)) {
    return { eq: [obj.eq[0], obj.eq[1]] }
  }
  if ("neq" in obj && Array.isArray(obj.neq)) {
    return { neq: [obj.neq[0], obj.neq[1]] }
  }
  return sortKeys(obj as Record<string, unknown>)
}

function normalizeStepNode(node: StepNode): StepNode {
  const out: StepNode = {
    type: "step",
    id: node.id,
    uses: node.uses,
  }
  if (node.label) out.label = node.label
  if (node.input) out.input = normalizeInputValue(node.input) as StepNode["input"]
  if (node.as) out.as = node.as
  if (node.mode) out.mode = node.mode as CommitMode
  if (node.when) out.when = normalizeExpr(node.when) as StepNode["when"]
  return out
}

function normalizeNode(node: WorkflowNode): WorkflowNode {
  if (!node.type || node.type === "step") {
    return normalizeStepNode(node as StepNode)
  }
  if (node.type === "loop") {
    const loop = node as LoopNode
    return {
      type: "loop",
      id: loop.id,
      ...(loop.label ? { label: loop.label } : {}),
      ...(loop.until ? { until: normalizeExpr(loop.until) as LoopNode["until"] } : {}),
      ...(loop.maxRounds !== undefined ? { maxRounds: loop.maxRounds } : {}),
      steps: loop.steps.map(normalizeNode),
    }
  }
  if (node.type === "parallel") {
    const par = node as ParallelNode
    return {
      type: "parallel",
      id: par.id,
      ...(par.label ? { label: par.label } : {}),
      branches: par.branches.map((b) => b.map(normalizeNode)),
    }
  }
  const branch = node as BranchNode
  return {
    type: "branch",
    id: branch.id,
    ...(branch.label ? { label: branch.label } : {}),
    branches: branch.branches.map((b) => ({
      ...(b.label ? { label: b.label } : {}),
      when: normalizeExpr(b.when) as BranchNode["branches"][0]["when"],
      steps: b.steps.map(normalizeNode),
    })),
  }
}

/**
 * Normalize a workflow manifest for stable round-trip comparison.
 * @category Encoding
 */
export function normalizeWorkflowManifest(manifest: WorkflowManifest): WorkflowManifest {
  return {
    schema: "@executioncontrolprotocol.workflow",
    version: manifest.version,
    workflow: {
      id: manifest.workflow.id,
      ...(manifest.workflow.label ? { label: manifest.workflow.label } : {}),
    },
    steps: manifest.steps.map(normalizeNode),
  }
}
