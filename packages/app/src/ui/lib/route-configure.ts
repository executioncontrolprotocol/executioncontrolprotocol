import { renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type { ExprValue, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/core/types"
import type { ReactFlowRouteEdgeData } from "../../graph/index.js"

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
 * Apply route configure fields onto a workflow manifest and render Fluent source.
 * @category App
 */
export function renderConfiguredRouteSource(
  manifest: WorkflowManifest,
  route: ReactFlowRouteEdgeData,
  fields: { whenText?: string; untilText?: string; maxRounds?: number | undefined }
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
 * @category App
 */
export function edgeMenuActions(
  kind: "data" | "route" | "control" | undefined
): Array<"disconnect" | "configure"> {
  if (kind === "route") return ["configure"]
  if (kind === "data") return ["disconnect"]
  return []
}
