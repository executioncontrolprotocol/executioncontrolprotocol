import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import {
  type MermaidEncodeOptions,
  type MermaidFlowchartDirection,
  mermaidFlowchartHeader,
  resolveMermaidDirection,
} from "./options.js"

interface RenderSegment {
  lines: string[]
  entryIds: string[]
  exitIds: string[]
}

function indent(level: number): string {
  return "  ".repeat(level)
}

function escapeTitle(text: string): string {
  return text.replace(/"/g, "'")
}

/** Mermaid subgraph ids must be alphanumeric/underscore and not start with a digit. */
function sanitizeSubgraphId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  const base = cleaned.length > 0 ? cleaned : "group"
  return /^[0-9]/.test(base) ? `g_${base}` : base
}

function stepLabel(node: StepNode): string {
  const label = node.label ?? node.id
  return escapeTitle(label)
}

function nodeTitle(node: { id?: string; label?: string }, fallback: string): string {
  return escapeTitle(node.label ?? node.id ?? fallback)
}

/** Step nodes may omit `type` (e.g. compact TOON rows); match runtime executor rules. */
function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

function openSubgraph(
  lines: string[],
  groupId: string,
  title: string,
  level: number,
  direction: MermaidFlowchartDirection
): void {
  lines.push(`${indent(level)}subgraph ${groupId} [${title}]`)
  lines.push(`${indent(level + 1)}direction ${direction}`)
}

function connectSegments(
  lines: string[],
  fromIds: string[],
  toIds: string[],
  level: number
): void {
  if (fromIds.length === 0 || toIds.length === 0) return
  const pad = indent(level)
  for (const from of fromIds) {
    for (const to of toIds) {
      lines.push(`${pad}${from} --> ${to}`)
    }
  }
}

function renderStep(node: StepNode, nodeId: string, level: number): RenderSegment {
  const pad = indent(level)
  return {
    lines: [`${pad}${nodeId}["${stepLabel(node)}"]`],
    entryIds: [nodeId],
    exitIds: [nodeId],
  }
}

function renderParallel(
  node: Extract<WorkflowNode, { type: "parallel" }>,
  prefix: string,
  level: number,
  direction: MermaidFlowchartDirection
): RenderSegment {
  const groupId = sanitizeSubgraphId(`${prefix}${node.id}`)
  const lines: string[] = []
  openSubgraph(lines, groupId, nodeTitle(node, "parallel"), level, direction)
  const entryIds: string[] = []
  const exitIds: string[] = []

  node.branches.forEach((branch, bi) => {
    const branchId = sanitizeSubgraphId(`${groupId}_b${bi}`)
    lines.push(`${indent(level + 1)}subgraph ${branchId} [branch ${bi}]`)
    lines.push(`${indent(level + 2)}direction ${direction}`)
    const branchSeg = renderNodes(branch, `${prefix}${bi}_`, level + 2, direction)
    lines.push(...branchSeg.lines)
    lines.push(`${indent(level + 1)}end`)
    if (branchSeg.entryIds.length > 0) {
      entryIds.push(...branchSeg.entryIds)
      exitIds.push(...branchSeg.exitIds)
    }
  })

  lines.push(`${indent(level)}end`)
  return { lines, entryIds, exitIds }
}

function renderBranch(
  node: Extract<WorkflowNode, { type: "branch" }>,
  prefix: string,
  level: number,
  direction: MermaidFlowchartDirection
): RenderSegment {
  const groupId = sanitizeSubgraphId(`${prefix}${node.id}`)
  const lines: string[] = []
  openSubgraph(lines, groupId, nodeTitle(node, "branch"), level, direction)
  const entryIds: string[] = []
  const exitIds: string[] = []

  node.branches.forEach((arm, bi) => {
    const branchId = sanitizeSubgraphId(`${groupId}_b${bi}`)
    lines.push(`${indent(level + 1)}subgraph ${branchId} [${nodeTitle(arm, `branch ${bi}`)}]`)
    lines.push(`${indent(level + 2)}direction ${direction}`)
    const armSeg = renderNodes(arm.steps, `${prefix}${bi}_`, level + 2, direction)
    lines.push(...armSeg.lines)
    lines.push(`${indent(level + 1)}end`)
    if (armSeg.entryIds.length > 0) {
      entryIds.push(...armSeg.entryIds)
      exitIds.push(...armSeg.exitIds)
    }
  })

  lines.push(`${indent(level)}end`)
  return { lines, entryIds, exitIds }
}

function renderLoop(
  node: Extract<WorkflowNode, { type: "loop" }>,
  prefix: string,
  level: number,
  direction: MermaidFlowchartDirection
): RenderSegment {
  const groupId = sanitizeSubgraphId(`${prefix}${node.id}`)
  const lines: string[] = []
  openSubgraph(lines, groupId, nodeTitle(node, "loop"), level, direction)
  const inner = renderNodes(node.steps, `${prefix}_`, level + 1, direction)
  lines.push(...inner.lines)
  lines.push(`${indent(level)}end`)
  return {
    lines,
    entryIds: inner.entryIds,
    exitIds: inner.exitIds.length > 0 ? inner.exitIds : [],
  }
}

function renderNode(
  node: WorkflowNode,
  prefix: string,
  index: number,
  level: number,
  direction: MermaidFlowchartDirection
): RenderSegment {
  const nodeId = `${prefix}${index}`
  if (isStepNode(node)) {
    return renderStep(node, nodeId, level)
  }
  if (node.type === "parallel") {
    return renderParallel(node, `${nodeId}_`, level, direction)
  }
  if (node.type === "branch") {
    return renderBranch(node, `${nodeId}_`, level, direction)
  }
  return renderLoop(node, `${nodeId}`, level, direction)
}

function renderNodes(
  nodes: WorkflowNode[],
  prefix: string,
  level: number,
  direction: MermaidFlowchartDirection
): RenderSegment {
  const lines: string[] = []
  let entryIds: string[] = []
  let exitIds: string[] = []

  nodes.forEach((node, index) => {
    const segment = renderNode(node, prefix, index, level, direction)
    lines.push(...segment.lines)
    if (segment.entryIds.length === 0) return

    if (entryIds.length === 0) {
      entryIds = segment.entryIds
    } else {
      connectSegments(lines, exitIds, segment.entryIds, level)
    }
    exitIds = segment.exitIds
  })

  return { lines, entryIds, exitIds }
}

/**
 * Render a workflow manifest as a Mermaid flowchart (encode-only).
 * @category Encoding
 */
export function workflowToMermaid(
  manifest: WorkflowManifest,
  options?: MermaidEncodeOptions
): string {
  const direction = resolveMermaidDirection(options)
  const wfId = sanitizeSubgraphId(manifest.workflow.id)
  const wfTitle = escapeTitle(manifest.workflow.label ?? manifest.workflow.id)
  const lines = [mermaidFlowchartHeader(options)]
  openSubgraph(lines, wfId, wfTitle, 1, direction)

  if (manifest.steps.length === 0) {
    lines.push(`${indent(2)}empty["no steps"]`)
  } else {
    const body = renderNodes(manifest.steps, "s", 2, direction)
    lines.push(...body.lines)
  }

  lines.push(`${indent(1)}end`)
  return lines.join("\n")
}
