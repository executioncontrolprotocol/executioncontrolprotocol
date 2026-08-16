import type { Registry } from "@executioncontrolprotocol/core"
import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import { extractDataEdges } from "./extract-data-edges.js"
import { layoutReactFlowDocument } from "./layout.js"
import { portsForStep } from "./ports-from-zod.js"
import type {
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
  ReactFlowGroupData,
  ReactFlowNode,
  ReactFlowStepData,
} from "./types.js"

interface RenderSegment {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  entryIds: string[]
  exitIds: string[]
}

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

function nodeTitle(node: { id?: string; label?: string }, fallback: string): string {
  return node.label ?? node.id ?? fallback
}

function connectControl(
  edges: ReactFlowEdge[],
  fromIds: string[],
  toIds: string[],
  prefix: string
): void {
  if (fromIds.length === 0 || toIds.length === 0) return
  let i = 0
  for (const from of fromIds) {
    for (const to of toIds) {
      edges.push({
        id: `ctrl-${prefix}-${i++}-${from}-${to}`,
        source: from,
        target: to,
        data: { kind: "control" },
      })
    }
  }
}

function renderStep(
  node: StepNode,
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  const ports = portsForStep(node, registry)
  const data: ReactFlowStepData = {
    label: node.label ?? node.id,
    uses: String(node.uses),
    ...(node.as !== undefined ? { as: node.as } : {}),
    inputs: ports.inputs,
    outputs: ports.outputs,
  }
  const rfNode: ReactFlowNode = {
    id: node.id,
    type: "ecp-step",
    position: { x: 0, y: 0 },
    data,
    ...(parentId !== undefined ? { parentId } : {}),
  }
  return { nodes: [rfNode], edges: [], entryIds: [node.id], exitIds: [node.id] }
}

function renderParallel(
  node: Extract<WorkflowNode, { type: "parallel" }>,
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  const groupId = node.id
  const groupData: ReactFlowGroupData = {
    label: nodeTitle(node, "parallel"),
    kind: "parallel",
  }
  const groupNode: ReactFlowNode = {
    id: groupId,
    type: "ecp-group",
    position: { x: 0, y: 0 },
    data: groupData,
    ...(parentId !== undefined ? { parentId } : {}),
  }

  const nodes: ReactFlowNode[] = [groupNode]
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []

  node.branches.forEach((branch, bi) => {
    const seg = renderNodes(branch, registry, groupId)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
    void bi
  })

  return {
    nodes,
    edges,
    entryIds: entryIds.length > 0 ? entryIds : [groupId],
    exitIds: exitIds.length > 0 ? exitIds : [groupId],
  }
}

function renderBranch(
  node: Extract<WorkflowNode, { type: "branch" }>,
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  const groupId = node.id
  const groupData: ReactFlowGroupData = {
    label: nodeTitle(node, "branch"),
    kind: "branch",
  }
  const groupNode: ReactFlowNode = {
    id: groupId,
    type: "ecp-group",
    position: { x: 0, y: 0 },
    data: groupData,
    ...(parentId !== undefined ? { parentId } : {}),
  }

  const nodes: ReactFlowNode[] = [groupNode]
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []

  for (const arm of node.branches) {
    const seg = renderNodes(arm.steps, registry, groupId)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
  }

  return {
    nodes,
    edges,
    entryIds: entryIds.length > 0 ? entryIds : [groupId],
    exitIds: exitIds.length > 0 ? exitIds : [groupId],
  }
}

function renderLoop(
  node: Extract<WorkflowNode, { type: "loop" }>,
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  const groupId = node.id
  const groupData: ReactFlowGroupData = {
    label: nodeTitle(node, "loop"),
    kind: "loop",
  }
  const groupNode: ReactFlowNode = {
    id: groupId,
    type: "ecp-group",
    position: { x: 0, y: 0 },
    data: groupData,
    ...(parentId !== undefined ? { parentId } : {}),
  }

  const inner = renderNodes(node.steps, registry, groupId)
  return {
    nodes: [groupNode, ...inner.nodes],
    edges: inner.edges,
    entryIds: inner.entryIds.length > 0 ? inner.entryIds : [groupId],
    exitIds: inner.exitIds.length > 0 ? inner.exitIds : [groupId],
  }
}

function renderNode(
  node: WorkflowNode,
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  if (isStepNode(node)) return renderStep(node, registry, parentId)
  if (node.type === "parallel") return renderParallel(node, registry, parentId)
  if (node.type === "branch") return renderBranch(node, registry, parentId)
  return renderLoop(node, registry, parentId)
}

function renderNodes(
  nodes: WorkflowNode[],
  registry: Registry | undefined,
  parentId?: string
): RenderSegment {
  const outNodes: ReactFlowNode[] = []
  const outEdges: ReactFlowEdge[] = []
  let entryIds: string[] = []
  let exitIds: string[] = []

  nodes.forEach((node, index) => {
    const segment = renderNode(node, registry, parentId)
    outNodes.push(...segment.nodes)
    outEdges.push(...segment.edges)
    if (segment.entryIds.length === 0) return

    if (entryIds.length === 0) {
      entryIds = segment.entryIds
    } else {
      connectControl(outEdges, exitIds, segment.entryIds, `seq-${parentId ?? "root"}-${index}`)
    }
    exitIds = segment.exitIds
  })

  return { nodes: outNodes, edges: outEdges, entryIds, exitIds }
}

/**
 * Convert a workflow manifest into a positioned React Flow document.
 * @category Encoding
 */
export function workflowToReactFlow(
  manifest: WorkflowManifest,
  registry?: Registry,
  options?: ReactFlowEncodeOptions
): ReactFlowDocument {
  const workflowGroupId = `wf-${manifest.workflow.id}`
  const groupNode: ReactFlowNode = {
    id: workflowGroupId,
    type: "ecp-group",
    position: { x: 0, y: 0 },
    data: {
      label: manifest.workflow.label ?? manifest.workflow.id,
      kind: "workflow",
    },
  }

  if (manifest.steps.length === 0) {
    return layoutReactFlowDocument({ nodes: [groupNode], edges: [] }, options)
  }

  const body = renderNodes(manifest.steps, registry, workflowGroupId)
  const dataEdges = extractDataEdges(manifest.steps)
  const doc: ReactFlowDocument = {
    nodes: [groupNode, ...body.nodes],
    edges: [...body.edges, ...dataEdges],
  }
  return layoutReactFlowDocument(doc, options)
}
