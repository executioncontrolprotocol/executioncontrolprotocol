import type { Registry } from "@executioncontrolprotocol/core"
import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import { extractDataEdges } from "./extract-data-edges.js"
import { layoutReactFlowDocument } from "./layout.js"
import { portsForStep } from "./ports-from-zod.js"
import type {
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
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

function renderStep(node: StepNode, registry: Registry | undefined): RenderSegment {
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
  }
  return { nodes: [rfNode], edges: [], entryIds: [node.id], exitIds: [node.id] }
}

/**
 * Flatten structural containers (parallel / branch / loop) to step nodes only.
 * The React Flow canvas is the workflow surface — no subgroup wrappers.
 */
function renderParallel(
  node: Extract<WorkflowNode, { type: "parallel" }>,
  registry: Registry | undefined
): RenderSegment {
  const nodes: ReactFlowNode[] = []
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []

  node.branches.forEach((branch) => {
    const seg = renderNodes(branch, registry)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
  })

  return { nodes, edges, entryIds, exitIds }
}

function renderBranch(
  node: Extract<WorkflowNode, { type: "branch" }>,
  registry: Registry | undefined
): RenderSegment {
  const nodes: ReactFlowNode[] = []
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []

  for (const arm of node.branches) {
    const seg = renderNodes(arm.steps, registry)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
  }

  return { nodes, edges, entryIds, exitIds }
}

function renderLoop(
  node: Extract<WorkflowNode, { type: "loop" }>,
  registry: Registry | undefined
): RenderSegment {
  return renderNodes(node.steps, registry)
}

function renderNode(node: WorkflowNode, registry: Registry | undefined): RenderSegment {
  if (isStepNode(node)) return renderStep(node, registry)
  if (node.type === "parallel") return renderParallel(node, registry)
  if (node.type === "branch") return renderBranch(node, registry)
  return renderLoop(node, registry)
}

function renderNodes(nodes: WorkflowNode[], registry: Registry | undefined): RenderSegment {
  const outNodes: ReactFlowNode[] = []
  const outEdges: ReactFlowEdge[] = []
  let entryIds: string[] = []
  let exitIds: string[] = []

  nodes.forEach((node, index) => {
    const segment = renderNode(node, registry)
    outNodes.push(...segment.nodes)
    outEdges.push(...segment.edges)
    if (segment.entryIds.length === 0) return

    if (entryIds.length === 0) {
      entryIds = segment.entryIds
    } else {
      connectControl(outEdges, exitIds, segment.entryIds, `seq-root-${index}`)
    }
    exitIds = segment.exitIds
  })

  return { nodes: outNodes, edges: outEdges, entryIds, exitIds }
}

/**
 * Convert a workflow manifest into a positioned React Flow document.
 * Emits step nodes only (no workflow / parallel / branch / loop group wrappers).
 * @category Encoding
 */
export function workflowToReactFlow(
  manifest: WorkflowManifest,
  registry?: Registry,
  options?: ReactFlowEncodeOptions
): ReactFlowDocument {
  if (manifest.steps.length === 0) {
    return { nodes: [], edges: [] }
  }

  const body = renderNodes(manifest.steps, registry)
  const dataEdges = extractDataEdges(manifest.steps)
  const doc: ReactFlowDocument = {
    nodes: body.nodes,
    edges: [...body.edges, ...dataEdges],
  }
  return layoutReactFlowDocument(doc, options)
}
