import type { Registry } from "@executioncontrolprotocol/core"
import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/core/types"
import {
  collectSteps,
  extractDataEdges,
  extractWhenEdges,
  formatWhenBadge,
  longestMatchingPortId,
  WHEN_HANDLE_ID,
} from "./extract-data-edges.js"
import {
  acceptsReactFlowNode,
  jsonSchemaObjectProperties,
  returnsReactFlowNode,
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
} from "./io-from-schema.js"
import { layoutReactFlowDocument } from "./layout.js"
import { portsForStep, ensureOutputPort, ensureInputPort } from "./ports-from-zod.js"
import type {
  CapabilitySchemaIndex,
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
  ReactFlowNode,
  ReactFlowRouteEdgeData,
  ReactFlowStepData,
} from "./types.js"

interface EncodeContext {
  registry: Registry | undefined
  capabilitySchemas: CapabilitySchemaIndex | undefined
}

/** Route entry metadata so parents can emit labeled enter edges. */
interface RouteEntry {
  entryId: string
  data: Omit<ReactFlowRouteEdgeData, "kind"> & { kind?: "route" }
}

interface RenderSegment {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  entryIds: string[]
  exitIds: string[]
  /** When set, predecessors emit route edges into these entries instead of control glue. */
  routeEntries?: RouteEntry[]
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

function connectRoutes(
  edges: ReactFlowEdge[],
  fromIds: string[],
  routeEntries: RouteEntry[],
  prefix: string
): void {
  if (fromIds.length === 0 || routeEntries.length === 0) return
  let i = 0
  for (const from of fromIds) {
    for (const entry of routeEntries) {
      edges.push({
        id: `route-${prefix}-${i++}-${from}-${entry.entryId}`,
        source: from,
        target: entry.entryId,
        data: { kind: "route", ...entry.data },
      })
    }
  }
}

function renderStep(node: StepNode, ctx: EncodeContext): RenderSegment {
  const ports = portsForStep(node, ctx.registry, ctx.capabilitySchemas?.[String(node.uses)])
  const data: ReactFlowStepData = {
    label: node.label ?? node.id,
    uses: String(node.uses),
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(node.when !== undefined ? { whenBadge: formatWhenBadge(node.when) } : {}),
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

function renderParallel(
  node: Extract<WorkflowNode, { type: "parallel" }>,
  ctx: EncodeContext
): RenderSegment {
  const nodes: ReactFlowNode[] = []
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []
  const routeEntries: RouteEntry[] = []

  node.branches.forEach((branch, laneIndex) => {
    const seg = renderNodes(branch, ctx)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
    const laneSteps: StepNode[] = []
    collectSteps(branch, laneSteps)
    for (const entryId of seg.entryIds) {
      routeEntries.push({
        entryId,
        data: {
          route: "parallel",
          structureId: node.id,
          armIndex: laneIndex,
          ...(node.label ? { label: node.label } : {}),
          stepIds: laneSteps.map((s) => s.id),
        },
      })
    }
  })

  return { nodes, edges, entryIds, exitIds, routeEntries }
}

function renderBranch(
  node: Extract<WorkflowNode, { type: "branch" }>,
  ctx: EncodeContext
): RenderSegment {
  const nodes: ReactFlowNode[] = []
  const edges: ReactFlowEdge[] = []
  const entryIds: string[] = []
  const exitIds: string[] = []
  const routeEntries: RouteEntry[] = []

  node.branches.forEach((arm, armIndex) => {
    const seg = renderNodes(arm.steps, ctx)
    nodes.push(...seg.nodes)
    edges.push(...seg.edges)
    entryIds.push(...seg.entryIds)
    exitIds.push(...seg.exitIds)
    const armSteps: StepNode[] = []
    collectSteps(arm.steps, armSteps)
    for (const entryId of seg.entryIds) {
      routeEntries.push({
        entryId,
        data: {
          route: "branch",
          structureId: node.id,
          armIndex,
          ...(arm.label ? { label: arm.label } : {}),
          whenBadge: formatWhenBadge(arm.when),
          stepIds: armSteps.map((s) => s.id),
        },
      })
    }
  })

  return { nodes, edges, entryIds, exitIds, routeEntries }
}

function renderLoop(
  node: Extract<WorkflowNode, { type: "loop" }>,
  ctx: EncodeContext
): RenderSegment {
  const seg = renderNodes(node.steps, ctx)
  const bodySteps: StepNode[] = []
  collectSteps(node.steps, bodySteps)
  const stepIds = bodySteps.map((s) => s.id)
  const untilBadge = node.until !== undefined ? formatWhenBadge(node.until) : undefined
  const routeBase = {
    route: "loop" as const,
    structureId: node.id,
    ...(node.label ? { label: node.label } : {}),
    ...(untilBadge ? { untilBadge } : {}),
    ...(node.maxRounds !== undefined ? { maxRounds: node.maxRounds } : {}),
    stepIds,
  }

  const edges: ReactFlowEdge[] = [...seg.edges]
  let i = 0
  for (const from of seg.exitIds) {
    for (const to of seg.entryIds) {
      edges.push({
        id: `route-loop-back-${i++}-${from}-${to}`,
        source: from,
        target: to,
        data: { kind: "route", ...routeBase, loopBack: true },
      })
    }
  }

  const routeEntries: RouteEntry[] = seg.entryIds.map((entryId) => ({
    entryId,
    data: routeBase,
  }))

  return {
    nodes: seg.nodes,
    edges,
    entryIds: seg.entryIds,
    exitIds: seg.exitIds,
    routeEntries,
  }
}

function renderNode(node: WorkflowNode, ctx: EncodeContext): RenderSegment {
  if (isStepNode(node)) return renderStep(node, ctx)
  if (node.type === "parallel") return renderParallel(node, ctx)
  if (node.type === "branch") return renderBranch(node, ctx)
  return renderLoop(node, ctx)
}

function renderNodes(nodes: WorkflowNode[], ctx: EncodeContext): RenderSegment {
  const outNodes: ReactFlowNode[] = []
  const outEdges: ReactFlowEdge[] = []
  let entryIds: string[] = []
  let exitIds: string[] = []
  let firstRouteEntries: RouteEntry[] | undefined

  nodes.forEach((node, index) => {
    const segment = renderNode(node, ctx)
    outNodes.push(...segment.nodes)
    outEdges.push(...segment.edges)
    if (segment.entryIds.length === 0) return

    if (entryIds.length === 0) {
      entryIds = segment.entryIds
      firstRouteEntries = segment.routeEntries
    } else if (segment.routeEntries && segment.routeEntries.length > 0) {
      connectRoutes(outEdges, exitIds, segment.routeEntries, `seq-route-${index}`)
    } else {
      connectControl(outEdges, exitIds, segment.entryIds, `seq-root-${index}`)
    }
    exitIds = segment.exitIds
  })

  return {
    nodes: outNodes,
    edges: outEdges,
    entryIds,
    exitIds,
    ...(firstRouteEntries ? { routeEntries: firstRouteEntries } : {}),
  }
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
  const portIds = data.outputs.map((port) => port.id)
  const dotIndex = fieldName.indexOf(".")
  if (dotIndex >= 0) {
    const fieldPath = fieldName.slice(dotIndex + 1)
    return longestMatchingPortId(fieldPath, portIds)
  }
  if (data.outputs.some((port) => port.id === "output")) return "output"
  return sourceHandleForStep(data)
}

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
 * Emits step nodes, projected Inputs / Outputs, data edges (`$ref` / `.when()`),
 * and published route edges for parallel / branch / loop structure.
 * Unlabeled sequential control edges are used for layout, then discarded.
 * @category App
 */
export function workflowToReactFlow(
  manifest: WorkflowManifest,
  registry?: Registry,
  options?: ReactFlowEncodeOptions
): ReactFlowDocument {
  const acceptsNode = acceptsReactFlowNode(manifest)
  const returnsNode = returnsReactFlowNode(manifest)
  const ctx: EncodeContext = {
    registry,
    capabilitySchemas: options?.capabilitySchemas,
  }
  const body =
    manifest.steps.length === 0
      ? {
          nodes: [] as ReactFlowNode[],
          edges: [] as ReactFlowEdge[],
          entryIds: [] as string[],
          exitIds: [] as string[],
        }
      : renderNodes(manifest.steps, ctx)

  const nodes: ReactFlowNode[] = [acceptsNode, ...body.nodes]
  if (returnsNode) nodes.push(returnsNode)

  const outputPortIdsByStepId = new Map<string, string[]>()
  const inputPortIdsByStepId = new Map<string, string[]>()
  for (const node of body.nodes) {
    if (node.type !== "ecp-step") continue
    const data = node.data as ReactFlowStepData
    outputPortIdsByStepId.set(
      node.id,
      data.outputs.map((port) => port.id)
    )
    inputPortIdsByStepId.set(
      node.id,
      data.inputs.map((port) => port.id)
    )
  }
  const acceptsKeys = acceptsPropertyKeys(manifest)
  const dataEdges = extractDataEdges(
    manifest.steps,
    acceptsKeys,
    outputPortIdsByStepId,
    inputPortIdsByStepId
  )
  const whenEdges = extractWhenEdges(manifest.steps, acceptsKeys)
  const returnsEdges = extractReturnsEdges(manifest, nodes)
  const allDataEdges = [...dataEdges, ...whenEdges, ...returnsEdges]

  for (const edge of allDataEdges) {
    if (edge.sourceHandle) {
      const source = nodes.find((n) => n.id === edge.source)
      if (source && source.type === "ecp-step") {
        const data = source.data as ReactFlowStepData
        ensureOutputPort(data.outputs, edge.sourceHandle)
      }
    }
    if (edge.targetHandle) {
      const target = nodes.find((n) => n.id === edge.target)
      if (target && target.type === "ecp-step") {
        const data = target.data as ReactFlowStepData
        ensureInputPort(data.inputs, edge.targetHandle)
        if (edge.targetHandle === WHEN_HANDLE_ID && !data.whenBadge) {
          data.whenBadge = "when"
        }
      }
    }
  }

  const layoutEdges: ReactFlowEdge[] = [...body.edges, ...allDataEdges]
  if (body.entryIds.length > 0) {
    if (body.routeEntries && body.routeEntries.length > 0) {
      connectRoutes(layoutEdges, [acceptsNode.id], body.routeEntries, "io-accepts-route")
    } else {
      connectControl(layoutEdges, [acceptsNode.id], body.entryIds, "io-accepts")
    }
  } else if (returnsNode) {
    connectControl(layoutEdges, [acceptsNode.id], [returnsNode.id], "io-empty")
  }
  if (returnsNode && body.exitIds.length > 0) {
    connectControl(layoutEdges, body.exitIds, [returnsNode.id], "io-returns")
  }

  const doc: ReactFlowDocument = {
    nodes,
    edges: layoutEdges,
  }
  const laid = layoutReactFlowDocument(doc, options)
  return {
    nodes: laid.nodes,
    edges: laid.edges.filter(
      (edge) => edge.data.kind === "data" || edge.data.kind === "route"
    ),
  }
}
