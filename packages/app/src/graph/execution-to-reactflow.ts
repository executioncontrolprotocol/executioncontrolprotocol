import type {
  BranchNode,
  ExecutionManifest,
  LoopNode,
  Node,
  ParallelNode,
  StepNode,
} from "@executioncontrolprotocol/protocol"
import {
  collectSteps,
  EXPR_HANDLE_ID,
  extractDataEdges,
  extractExprEdges,
  formatExprBadge,
  OUTPUT_HANDLE_ID,
} from "./extract-data-edges.js"
import {
  acceptsPropertyKeys,
  acceptsReactFlowNode,
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  isStepNode,
  returnsReactFlowNode,
} from "./io-from-schema.js"
import { jsonSchemaObjectProperties } from "./json-schema.js"
import { layoutReactFlowDocument } from "./layout.js"
import { ensureInputPort, ensureOutputPort, portsForStep } from "./ports-from-schema.js"
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
  capabilitySchemas: CapabilitySchemaIndex | undefined
}

/** Route metadata a parent uses to draw labelled edges into a structure's entries. */
interface RouteEntry {
  entryId: string
  data: Omit<ReactFlowRouteEdgeData, "kind">
}

interface RenderSegment {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  entryIds: string[]
  exitIds: string[]
  /** When set, predecessors draw route edges into these entries instead of control glue. */
  routeEntries?: RouteEntry[]
}

function connectControl(edges: ReactFlowEdge[], fromIds: string[], toIds: string[], prefix: string): void {
  let i = 0
  for (const from of fromIds) {
    for (const to of toIds) {
      edges.push({ id: `ctrl-${prefix}-${i++}-${from}-${to}`, source: from, target: to, data: { kind: "control" } })
    }
  }
}

function connectRoutes(edges: ReactFlowEdge[], fromIds: string[], entries: RouteEntry[], prefix: string): void {
  let i = 0
  for (const from of fromIds) {
    for (const entry of entries) {
      edges.push({
        id: `route-${prefix}-${i++}-${from}-${entry.entryId}`,
        source: from,
        target: entry.entryId,
        data: { kind: "route", ...entry.data },
      })
    }
  }
}

function leafStepIds(nodes: Node[]): string[] {
  const steps: StepNode[] = []
  collectSteps(nodes, steps)
  return steps.map((step) => step.id)
}

function renderStep(node: StepNode, ctx: EncodeContext): RenderSegment {
  const ports = portsForStep(node, ctx.capabilitySchemas?.[node.uses])
  const data: ReactFlowStepData = {
    label: node.label ?? node.id,
    uses: node.uses,
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(node.mode !== undefined ? { mode: node.mode } : {}),
    ...(node.config !== undefined ? { config: node.config } : {}),
    ...(node.expr !== undefined ? { exprBadge: formatExprBadge(node.expr) } : {}),
    inputs: ports.inputs,
    outputs: ports.outputs,
  }
  return {
    nodes: [{ id: node.id, type: "ecp-step", position: { x: 0, y: 0 }, data }],
    edges: [],
    entryIds: [node.id],
    exitIds: [node.id],
  }
}

function renderParallel(node: ParallelNode, ctx: EncodeContext): RenderSegment {
  const out: RenderSegment = { nodes: [], edges: [], entryIds: [], exitIds: [], routeEntries: [] }
  node.branches.forEach((line, lineIndex) => {
    const seg = renderNodes(line, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    out.entryIds.push(...seg.entryIds)
    out.exitIds.push(...seg.exitIds)
    const stepIds = leafStepIds(line)
    for (const entryId of seg.entryIds) {
      out.routeEntries?.push({
        entryId,
        data: {
          route: "parallel",
          structureId: node.id,
          armIndex: lineIndex,
          ...(node.label ? { label: node.label } : {}),
          stepIds,
        },
      })
    }
  })
  return out
}

function renderBranch(node: BranchNode, ctx: EncodeContext): RenderSegment {
  const out: RenderSegment = { nodes: [], edges: [], entryIds: [], exitIds: [], routeEntries: [] }
  node.branches.forEach((arm, armIndex) => {
    const seg = renderNodes(arm.steps, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    out.entryIds.push(...seg.entryIds)
    out.exitIds.push(...seg.exitIds)
    const stepIds = leafStepIds(arm.steps)
    for (const entryId of seg.entryIds) {
      out.routeEntries?.push({
        entryId,
        data: {
          route: "branch",
          structureId: node.id,
          armIndex,
          ...(arm.label ? { label: arm.label } : {}),
          ...(arm.expr !== undefined ? { exprBadge: formatExprBadge(arm.expr) } : { defaultArm: true }),
          stepIds,
        },
      })
    }
  })
  return out
}

function renderLoop(node: LoopNode, ctx: EncodeContext): RenderSegment {
  const seg = renderNodes(node.steps, ctx)
  const routeBase: Omit<ReactFlowRouteEdgeData, "kind"> = {
    route: "loop",
    structureId: node.id,
    ...(node.label ? { label: node.label } : {}),
    exprBadge: formatExprBadge(node.expr),
    maxRounds: node.maxRounds,
    stepIds: leafStepIds(node.steps),
  }
  const edges = [...seg.edges]
  let i = 0
  for (const from of seg.exitIds) {
    for (const to of seg.entryIds) {
      edges.push({
        id: `route-loop-back-${node.id}-${i++}-${from}-${to}`,
        source: from,
        target: to,
        data: { kind: "route", ...routeBase, loopBack: true },
      })
    }
  }
  return {
    nodes: seg.nodes,
    edges,
    entryIds: seg.entryIds,
    exitIds: seg.exitIds,
    routeEntries: seg.entryIds.map((entryId) => ({ entryId, data: routeBase })),
  }
}

function renderNode(node: Node, ctx: EncodeContext): RenderSegment {
  if (isStepNode(node)) return renderStep(node, ctx)
  if (node.type === "parallel") return renderParallel(node, ctx)
  if (node.type === "branch") return renderBranch(node, ctx)
  return renderLoop(node, ctx)
}

function renderNodes(nodes: Node[], ctx: EncodeContext): RenderSegment {
  const out: RenderSegment = { nodes: [], edges: [], entryIds: [], exitIds: [] }
  nodes.forEach((node, index) => {
    const seg = renderNode(node, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    if (seg.entryIds.length === 0) return
    if (out.entryIds.length === 0) {
      out.entryIds = seg.entryIds
      if (seg.routeEntries) out.routeEntries = seg.routeEntries
    } else if (seg.routeEntries && seg.routeEntries.length > 0) {
      connectRoutes(out.edges, out.exitIds, seg.routeEntries, `seq-${index}`)
    } else {
      connectControl(out.edges, out.exitIds, seg.entryIds, `seq-${index}`)
    }
    out.exitIds = seg.exitIds
  })
  return out
}

function returnsSourceHandle(data: ReactFlowStepData): string {
  if (data.outputs.some((port) => port.id === OUTPUT_HANDLE_ID)) return OUTPUT_HANDLE_ID
  return data.outputs[0]?.id ?? OUTPUT_HANDLE_ID
}

function lastWriterByKey(steps: ReactFlowNode[]): Map<string, ReactFlowNode> {
  const out = new Map<string, ReactFlowNode>()
  for (const node of steps) {
    const as = (node.data as ReactFlowStepData).as
    if (as) out.set(as, node)
  }
  return out
}

function extractReturnsEdges(manifest: ExecutionManifest, stepNodes: ReactFlowNode[]): ReactFlowEdge[] {
  const fields = jsonSchemaObjectProperties(manifest.execution?.returns)
  if (fields.length === 0) return []
  const acceptsKeys = acceptsPropertyKeys(manifest)
  const writers = lastWriterByKey(stepNodes)
  const edges: ReactFlowEdge[] = []
  fields.forEach((field, i) => {
    const writer = writers.get(field.name)
    if (writer) {
      const data = writer.data as ReactFlowStepData
      edges.push({
        id: `data-returns-${i}-${writer.id}-${field.name}`,
        source: writer.id,
        target: EXECUTION_RETURNS_NODE_ID,
        sourceHandle: returnsSourceHandle(data),
        targetHandle: field.name,
        data: { kind: "data" },
      })
      return
    }
    if (!acceptsKeys.has(field.name)) return
    edges.push({
      id: `data-returns-${i}-${EXECUTION_ACCEPTS_NODE_ID}-${field.name}`,
      source: EXECUTION_ACCEPTS_NODE_ID,
      target: EXECUTION_RETURNS_NODE_ID,
      sourceHandle: field.name,
      targetHandle: field.name,
      data: { kind: "data" },
    })
  })
  return edges
}

function ensureEdgePorts(nodesById: Map<string, ReactFlowNode>, edges: ReactFlowEdge[]): void {
  for (const edge of edges) {
    const source = nodesById.get(edge.source)
    if (edge.sourceHandle && source?.type === "ecp-step") {
      ensureOutputPort((source.data as ReactFlowStepData).outputs, edge.sourceHandle)
    }
    const target = nodesById.get(edge.target)
    if (edge.targetHandle && target?.type === "ecp-step") {
      const data = target.data as ReactFlowStepData
      ensureInputPort(data.inputs, edge.targetHandle)
      if (edge.targetHandle === EXPR_HANDLE_ID && !data.exprBadge) data.exprBadge = EXPR_HANDLE_ID
    }
  }
}

/**
 * Convert an execution manifest into a positioned React Flow document.
 *
 * Emits step nodes, the projected Inputs (`execution.accepts`) and Outputs
 * (`execution.returns`) nodes, data edges (from `$ref` / `$state` / `$expr` reads, step
 * `expr` gates and `returns` keys) and route edges for parallel, branch and loop
 * structure. Unlabelled sequential control edges are used for layout, then dropped.
 * Pure: no I/O, no host calls. Typed ports need `options.capabilitySchemas`.
 * @category App
 */
export function executionToReactFlow(
  manifest: ExecutionManifest,
  options?: ReactFlowEncodeOptions,
): ReactFlowDocument {
  const ctx: EncodeContext = { capabilitySchemas: options?.capabilitySchemas }
  const steps = Array.isArray(manifest.steps) ? manifest.steps : []
  const acceptsNode = acceptsReactFlowNode(manifest)
  const returnsNode = returnsReactFlowNode(manifest)
  const body = renderNodes(steps, ctx)

  const nodes: ReactFlowNode[] = [acceptsNode, ...body.nodes]
  if (returnsNode) nodes.push(returnsNode)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  const outputPortIds = new Map<string, string[]>()
  const inputPortIds = new Map<string, string[]>()
  for (const node of body.nodes) {
    const data = node.data as ReactFlowStepData
    outputPortIds.set(node.id, data.outputs.map((port) => port.id))
    inputPortIds.set(node.id, data.inputs.map((port) => port.id))
  }

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const dataEdges = [
    ...extractDataEdges(steps, acceptsKeys, outputPortIds, inputPortIds),
    ...extractExprEdges(steps, acceptsKeys, outputPortIds),
    ...extractReturnsEdges(manifest, body.nodes),
  ]
  ensureEdgePorts(nodesById, dataEdges)

  const layoutEdges: ReactFlowEdge[] = [...body.edges, ...dataEdges]
  if (body.entryIds.length > 0) {
    if (body.routeEntries && body.routeEntries.length > 0) {
      connectRoutes(layoutEdges, [acceptsNode.id], body.routeEntries, "io-accepts")
    } else {
      connectControl(layoutEdges, [acceptsNode.id], body.entryIds, "io-accepts")
    }
  } else if (returnsNode) {
    connectControl(layoutEdges, [acceptsNode.id], [returnsNode.id], "io-empty")
  }
  if (returnsNode && body.exitIds.length > 0) {
    connectControl(layoutEdges, body.exitIds, [returnsNode.id], "io-returns")
  }

  const laid = layoutReactFlowDocument({ nodes, edges: layoutEdges }, options)
  return {
    nodes: laid.nodes,
    edges: laid.edges.filter((edge) => edge.data.kind !== "control"),
  }
}