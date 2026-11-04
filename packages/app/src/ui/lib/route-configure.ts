import { renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type {
  BranchNode,
  ExprValue,
  LoopNode,
  ParallelNode,
  StepNode,
  WorkflowManifest,
  WorkflowNode,
} from "@executioncontrolprotocol/core/types"
import type { ReactFlowRouteEdgeData, ReactFlowRouteKind } from "../../graph/index.js"

/**
 * Parse a short badge / dialog string into an {@link ExprValue}.
 * Accepts `eq(path, value)` / `neq(path, value)` (value is JSON).
 * @category App
 */
export function parseExprBadge(text: string): ExprValue {
  const trimmed = text.trim()
  const match = /^(eq|neq)\(\s*([^,]+)\s*,\s*(.*)\)\s*$/s.exec(trimmed)
  if (!match) {
    throw new Error('Expected eq(path, value) or neq(path, value) — value must be JSON (e.g. true, "x")')
  }
  const op = match[1] as "eq" | "neq"
  const path = match[2]!.trim().replace(/^["']|["']$/g, "")
  let value: unknown
  try {
    value = JSON.parse(match[3]!.trim())
  } catch {
    throw new Error("Expression value must be valid JSON")
  }
  return op === "eq" ? { eq: [path, value] } : { neq: [path, value] }
}

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

/**
 * Walk a node list and optionally replace a matching node with zero or more nodes.
 * Recurses into parallel / branch / loop children when the predicate returns null.
 * @category App
 */
export function replaceWorkflowNodes(
  nodes: WorkflowNode[],
  replace: (node: WorkflowNode) => WorkflowNode[] | null
): WorkflowNode[] {
  const result: WorkflowNode[] = []
  for (const node of nodes) {
    const next = replace(node)
    if (next) {
      result.push(...next)
      continue
    }
    if (isStepNode(node)) {
      result.push(node)
      continue
    }
    if (node.type === "parallel") {
      result.push({
        ...node,
        branches: node.branches.map((lane) => replaceWorkflowNodes(lane, replace)),
      })
      continue
    }
    if (node.type === "branch") {
      result.push({
        ...node,
        branches: node.branches.map((arm) => ({
          ...arm,
          steps: replaceWorkflowNodes(arm.steps, replace),
        })),
      })
      continue
    }
    result.push({
      ...node,
      steps: replaceWorkflowNodes(node.steps, replace),
    })
  }
  return result
}

function mapNodes(
  nodes: WorkflowNode[],
  visit: (node: WorkflowNode) => WorkflowNode
): WorkflowNode[] {
  return nodes.map((node) => {
    const next = visit(node)
    if (!next.type || next.type === "step") return next
    if (next.type === "parallel") {
      return {
        ...next,
        branches: next.branches.map((branch) => mapNodes(branch, visit)),
      }
    }
    if (next.type === "branch") {
      return {
        ...next,
        branches: next.branches.map((arm) => ({
          ...arm,
          steps: mapNodes(arm.steps, visit),
        })),
      }
    }
    return {
      ...next,
      steps: mapNodes(next.steps, visit),
    }
  })
}

/**
 * Flatten a structural node into sequential children for unwrap.
 * Branch arm `when` is copied onto the first bare step when that step has no `when`.
 * @category App
 */
export function flattenRouteStructure(node: WorkflowNode): WorkflowNode[] {
  if (node.type === "loop") return [...node.steps]
  if (node.type === "parallel") return node.branches.flatMap((lane) => lane)
  if (node.type === "branch") {
    return node.branches.flatMap((arm) => {
      if (arm.steps.length === 0) return []
      const first = arm.steps[0]!
      if (isStepNode(first) && first.when === undefined) {
        return [{ ...first, when: arm.when }, ...arm.steps.slice(1)]
      }
      return [...arm.steps]
    })
  }
  return [node]
}

/**
 * Unwrap a branch / parallel / loop by id into flat sibling steps and render Fluent.
 * @category App
 */
export function renderUnwrappedRouteSource(
  manifest: WorkflowManifest,
  structureId: string
): string {
  let found = false
  const steps = replaceWorkflowNodes(manifest.steps, (node) => {
    if (node.id !== structureId) return null
    if (node.type !== "branch" && node.type !== "parallel" && node.type !== "loop") {
      return null
    }
    found = true
    return flattenRouteStructure(node)
  })
  if (!found) {
    throw new Error(`Route structure "${structureId}" was not found`)
  }
  return renderWorkflowToFluent({ ...manifest, steps })
}

/** Fields for wrapping a step or editing an existing route. @category App */
export interface RouteConfigureFields {
  /** Route kind when wrapping a data-edge target. */
  routeKind?: ReactFlowRouteKind
  /** Branch `when` text. */
  whenText?: string
  /** Loop `until` text. */
  untilText?: string
  /** Loop `maxRounds`. */
  maxRounds?: number | undefined
}

function wrapStepNode(step: StepNode, fields: RouteConfigureFields): WorkflowNode {
  const kind = fields.routeKind ?? "loop"
  const idBase = step.id || "step"
  if (kind === "loop") {
    const until =
      fields.untilText !== undefined && fields.untilText.trim()
        ? parseExprBadge(fields.untilText)
        : undefined
    const wrapped: LoopNode = {
      type: "loop",
      id: `loop-${idBase}`,
      steps: [step],
      ...(until ? { until } : {}),
      ...(fields.maxRounds !== undefined ? { maxRounds: fields.maxRounds } : {}),
    }
    return wrapped
  }
  if (kind === "parallel") {
    const wrapped: ParallelNode = {
      type: "parallel",
      id: `parallel-${idBase}`,
      branches: [[step]],
    }
    return wrapped
  }
  if (!fields.whenText?.trim()) {
    throw new Error("Branch wrap requires a when expression")
  }
  const when = parseExprBadge(fields.whenText)
  const wrapped: BranchNode = {
    type: "branch",
    id: `branch-${idBase}`,
    branches: [
      {
        when,
        steps: [step],
      },
    ],
  }
  return wrapped
}

/**
 * Wrap a leaf step in branch / parallel / loop and render Fluent source.
 * @category App
 */
export function renderWrappedStepSource(
  manifest: WorkflowManifest,
  targetStepId: string,
  fields: RouteConfigureFields
): string {
  let found = false
  const steps = replaceWorkflowNodes(manifest.steps, (node) => {
    if (!isStepNode(node) || node.id !== targetStepId) return null
    found = true
    return [wrapStepNode(node, fields)]
  })
  if (!found) {
    throw new Error(`Step "${targetStepId}" was not found`)
  }
  return renderWorkflowToFluent({ ...manifest, steps })
}

/**
 * Apply route configure fields onto a workflow manifest and render Fluent source.
 * @category App
 */
export function renderConfiguredRouteSource(
  manifest: WorkflowManifest,
  route: ReactFlowRouteEdgeData,
  fields: RouteConfigureFields
): string {
  const nextSteps = mapNodes(manifest.steps, (node) => {
    if (node.type === "branch" && route.route === "branch" && node.id === route.structureId) {
      if (route.armIndex === undefined || fields.whenText === undefined) return node
      const when = parseExprBadge(fields.whenText)
      return {
        ...node,
        branches: node.branches.map((arm, index) =>
          index === route.armIndex ? { ...arm, when } : arm
        ),
      }
    }
    if (node.type === "loop" && route.route === "loop" && node.id === route.structureId) {
      const until =
        fields.untilText !== undefined && fields.untilText.trim()
          ? parseExprBadge(fields.untilText)
          : undefined
      return {
        ...node,
        ...(until ? { until } : { until: undefined }),
        ...(fields.maxRounds === undefined
          ? { maxRounds: undefined }
          : { maxRounds: fields.maxRounds }),
      }
    }
    return node
  })

  const patched: WorkflowManifest = {
    ...manifest,
    steps: nextSteps,
  }
  return renderWorkflowToFluent(patched)
}

/**
 * Menu actions available for an edge kind.
 * Data and route edges both offer configure + delete (disconnect / unwrap).
 * @category App
 */
export function edgeMenuActions(
  kind: "data" | "route" | "control" | undefined
): Array<"configure" | "disconnect"> {
  if (kind === "route" || kind === "data") return ["configure", "disconnect"]
  return []
}
