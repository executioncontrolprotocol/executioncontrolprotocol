import type { Registry } from "@executioncontrolprotocol/core"
import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import { extractDataEdges } from "./extract-data-edges.js"
import {
  acceptsReactFlowNode,
  jsonSchemaObjectProperties,
  returnsReactFlowNode,
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
} from "./io-from-schema.js"
import { layoutReactFlowDocument } from "./layout.js"
import { portsForStep, ensureOutputPort } from "./ports-from-zod.js"
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

function acceptsPropertyKeys(manifest: WorkflowManifest): Set<string> {
  return new Set(jsonSchemaObjectProperties(manifest.workflow.accepts).map((field) => field.name))
}

function sourceHandleForStep(data: ReactFlowStepData): string {
  return data.outputs[0]?.id ?? "output"
}

function returnsAsKey(fieldName: string): string {
  const dotIndex = fieldName.indexOf(".")
  return dotIndex === -1 ? fieldName : fieldName.slice(0, dotIndex)
}

function sourceHandleForReturnsField(fieldName: string, data: ReactFlowStepData): string {
  const dotIndex = fieldName.indexOf(".")
  if (dotIndex >= 0) {
    const fieldPath = fieldName.slice(dotIndex + 1)
    if (!fieldPath) return "output"
    return fieldPath.split(".")[0]!
  }
  if (data.outputs.some((port) => port.id === "output")) return "output"
  return sourceHandleForStep(data)
}

/**
 * Edges from steps whose `.as` matches a `returns` property, or from Inputs
 * when the property is an `accepts` key, to the Outputs node.
 */
function extractReturnsEdges(manifest: WorkflowManifest, nodes: ReactFlowNode[]): ReactFlowEdge[] {
  const returnsNode = nodes.find((n) => n.id === WORKFLOW_RETURNS_NODE_ID && n.type === "ecp-io")
  if (!returnsNode) return []
  const fields = jsonSchemaObjectProperties(manifest.workflow.returns)
  const acceptsKeys = acceptsPropertyKeys(manifest)
  const asToStep = new Map<string, ReactFlowNode>()
  for (const node of nodes) {
    if (node.type !== "ecp-step") continue
    const data = node.data as ReactFlowStepData
    if (data.as) asToStep.set(data.as, node)
  }
  const edges: ReactFlowEdge[] = []
  let i = 0
  for (const field of fields) {
    const asKey = returnsAsKey(field.name)
    const stepSource = asToStep.get(asKey)
    if (stepSource && stepSource.type === "ecp-step") {
      const data = stepSource.data as ReactFlowStepData
      edges.push({
        id: `data-returns-${i++}-${stepSource.id}-${field.name}`,
        source: stepSource.id,
        target: WORKFLOW_RETURNS_NODE_ID,
        sourceHandle: sourceHandleForReturnsField(field.name, data),
        targetHandle: field.name,
        data: { kind: "data" },
      })
      continue
    }
    if (!acceptsKeys.has(field.name)) continue
    edges.push({
      id: `data-returns-${i++}-${WORKFLOW_ACCEPTS_NODE_ID}-${field.name}`,
      source: WORKFLOW_ACCEPTS_NODE_ID,
      target: WORKFLOW_RETURNS_NODE_ID,
      sourceHandle: field.name,
      targetHandle: field.name,
      data: { kind: "data" },
    })
  }
  return edges
}

/**
 * Convert a workflow manifest into a positioned React Flow document.
 * Emits step nodes, projected Inputs / Outputs (`ecp-io`), and **data** edges.
 * Sequential control edges are used internally for layout, then discarded.
 * @category Encoding
 */
export function workflowToReactFlow(
  manifest: WorkflowManifest,
  registry?: Registry,
  options?: ReactFlowEncodeOptions
): ReactFlowDocument {
  const acceptsNode = acceptsReactFlowNode(manifest)
  const returnsNode = returnsReactFlowNode(manifest)
  const body =
    manifest.steps.length === 0
      ? { nodes: [] as ReactFlowNode[], edges: [] as ReactFlowEdge[], entryIds: [] as string[], exitIds: [] as string[] }
      : renderNodes(manifest.steps, registry)

  const nodes: ReactFlowNode[] = [acceptsNode, ...body.nodes]
  if (returnsNode) nodes.push(returnsNode)

  const dataEdges = extractDataEdges(manifest.steps, acceptsPropertyKeys(manifest))
  const returnsEdges = extractReturnsEdges(manifest, nodes)
  const allDataEdges = [...dataEdges, ...returnsEdges]

  for (const edge of allDataEdges) {
    if (!edge.sourceHandle) continue
    const source = nodes.find((n) => n.id === edge.source)
    if (!source || source.type !== "ecp-step") continue
    const data = source.data as ReactFlowStepData
    ensureOutputPort(data.outputs, edge.sourceHandle)
  }

  const layoutEdges: ReactFlowEdge[] = [...body.edges, ...allDataEdges]
  if (body.entryIds.length > 0) {
    connectControl(layoutEdges, [acceptsNode.id], body.entryIds, "io-accepts")
  } else if (returnsNode) {
    connectControl(layoutEdges, [acceptsNode.id], [returnsNode.id], "io-empty")
  }
  if (returnsNode && body.exitIds.length > 0) {
    connectControl(layoutEdges, body.exitIds, [returnsNode.id], "io-returns")
  }

  const doc: ReactFlowDocument = {
    nodes,
    // Control edges rank sequential / parallel steps for dagre; they are not
    // property mappings and are stripped from the published document below.
    edges: layoutEdges,
  }
  const laid = layoutReactFlowDocument(doc, options)
  return {
    nodes: laid.nodes,
    edges: laid.edges.filter((edge) => edge.data.kind === "data"),
  }
}
