import type { BranchNode, ExecutionManifest, LoopNode, Node, ParallelNode, StepNode } from "@executioncontrolprotocol/protocol"
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
import { boundsAroundNodeIds, FRAME_PADDING, layoutReactFlowDocument } from "./layout.js"
import { ensureInputPort, ensureOutputPort, portsForStep } from "./ports-from-schema.js"
import type {
  CapabilitySchemaIndex,
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
  ReactFlowFrameData,
  ReactFlowLoopItemsData,
  ReactFlowNode,
  ReactFlowPort,
  ReactFlowRouteEdgeData,
  ReactFlowRouteLevel,
  ReactFlowStepData,
} from "./types.js"
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_COLLECT_HANDLE,
  LOOP_INTO_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_REF_HANDLE,
} from "./types.js"

/** One post-layout overlay frame per branch, parallel, or loop. */
interface StructureFrame {
  /** Stable React Flow node id (`ecp:frame:…`). */
  frameId: string
  /** Manifest structure id. */
  structureId: string
  structureKind: "branch" | "parallel" | "loop"
  loopMode?: "while" | "for" | "forEach"
  /** Header text. */
  label: string
  /** Body node ids, including loop heads. */
  memberNodeIds: string[]
  /** Nested frame ids contained in this frame. */
  childFrameIds: string[]
  /** Nesting depth (`0` at the top level). */
  depth: number
}

interface FrameStackEntry {
  spec: StructureFrame
}

interface EncodeContext {
  capabilitySchemas: CapabilitySchemaIndex | undefined
  structureFrames: StructureFrame[]
  frameStack: FrameStackEntry[]
}

function beginStructureFrame(
  ctx: EncodeContext,
  partial: Pick<StructureFrame, "frameId" | "structureId" | "structureKind" | "label"> &
    Partial<Pick<StructureFrame, "loopMode">>,
): void {
  const parent = ctx.frameStack[ctx.frameStack.length - 1]
  const spec: StructureFrame = {
    frameId: partial.frameId,
    structureId: partial.structureId,
    structureKind: partial.structureKind,
    label: partial.label,
    memberNodeIds: [],
    childFrameIds: [],
    depth: ctx.frameStack.length,
    ...(partial.loopMode !== undefined ? { loopMode: partial.loopMode } : {}),
  }
  if (parent) parent.spec.childFrameIds.push(spec.frameId)
  ctx.frameStack.push({ spec })
  ctx.structureFrames.push(spec)
}

function endStructureFrame(ctx: EncodeContext, memberNodeIds: readonly string[]): void {
  const current = ctx.frameStack.pop()
  if (current) current.spec.memberNodeIds = [...memberNodeIds]
}

function structureFrameLabel(node: BranchNode | ParallelNode | LoopNode): string {
  if (node.label) return node.label
  if (node.type === "branch") return "branch"
  if (node.type === "parallel") return "parallel"
  const mode = loopMode(node)
  if (mode === "forEach") return loopItemsFrameLabel(node)
  if (mode === "while") return "while"
  return "for N"
}

function nodeIdsInSegment(seg: RenderSegment): string[] {
  return seg.nodes.map((node) => node.id)
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

function routePayload(level: ReactFlowRouteLevel, extra?: { loopBack?: boolean }): Omit<ReactFlowRouteEdgeData, "kind"> {
  return { ...level, levels: [level], ...extra }
}

function composedRouteEntries(seg: RenderSegment, outer: ReactFlowRouteLevel): RouteEntry[] {
  if (seg.routeEntries && seg.routeEntries.length > 0) {
    return seg.routeEntries.map((entry) => ({
      entryId: entry.entryId,
      data: {
        ...outer,
        levels: [outer, ...entry.data.levels],
      },
    }))
  }
  return seg.entryIds.map((entryId) => ({
    entryId,
    data: { ...outer, levels: [outer] },
  }))
}

function connectRoutes(edges: ReactFlowEdge[], fromIds: string[], entries: RouteEntry[], prefix: string): void {
  let i = 0
  for (const from of fromIds) {
    for (const entry of entries) {
      edges.push({
        id: `route-${prefix}-${i++}-${from}-${entry.entryId}`,
        source: from,
        target: entry.entryId,
        sourceHandle: FLOW_OUT_HANDLE,
        targetHandle: FLOW_IN_HANDLE,
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
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "parallel",
    label: structureFrameLabel(node),
  })
  const memberIds = new Set<string>()
  node.branches.forEach((line, lineIndex) => {
    const seg = renderNodes(line, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    out.entryIds.push(...seg.entryIds)
    out.exitIds.push(...seg.exitIds)
    for (const id of nodeIdsInSegment(seg)) memberIds.add(id)
    const stepIds = leafStepIds(line)
    const outer: ReactFlowRouteLevel = {
      route: "parallel",
      structureId: node.id,
      armIndex: lineIndex,
      stepIds,
    }
    out.routeEntries?.push(...composedRouteEntries(seg, outer))
  })
  endStructureFrame(ctx, [...memberIds])
  return out
}

function renderBranch(node: BranchNode, ctx: EncodeContext): RenderSegment {
  const out: RenderSegment = { nodes: [], edges: [], entryIds: [], exitIds: [], routeEntries: [] }
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "branch",
    label: structureFrameLabel(node),
  })
  const memberIds = new Set<string>()
  node.branches.forEach((arm, armIndex) => {
    const seg = renderNodes(arm.steps, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    out.entryIds.push(...seg.entryIds)
    out.exitIds.push(...seg.exitIds)
    for (const id of nodeIdsInSegment(seg)) memberIds.add(id)
    const stepIds = leafStepIds(arm.steps)
    const outer: ReactFlowRouteLevel = {
      route: "branch",
      structureId: node.id,
      armIndex,
      ...(arm.label ? { label: arm.label } : {}),
      ...(arm.expr !== undefined
        ? { exprBadge: formatExprBadge(arm.expr), exprSource: arm.expr }
        : { defaultArm: true }),
      stepIds,
    }
    out.routeEntries?.push(...composedRouteEntries(seg, outer))
  })
  endStructureFrame(ctx, [...memberIds])
  return out
}

function loopMode(node: LoopNode): "while" | "for" | "forEach" {
  return node.mode ?? "while"
}

function renderLoop(node: LoopNode, ctx: EncodeContext): RenderSegment {
  const mode = loopMode(node)
  if (mode === "forEach") return renderLoopForEach(node, ctx)
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "loop",
    loopMode: mode,
    label: structureFrameLabel(node),
  })
  const head = loopReactFlowNode(node)
  const seg = renderNodes(node.steps, ctx)
  const gateLabel = node.expr ? formatExprBadge(node.expr) : node.ref ? `ref: ${node.ref}` : "loop"
  const loopLevel: ReactFlowRouteLevel = {
    route: "loop",
    structureId: node.id,
    loopMode: mode,
    ...(node.label ? { label: node.label } : {}),
    exprBadge: gateLabel,
    ...(node.expr ? { exprSource: node.expr } : {}),
    ...(node.maxRounds !== undefined ? { maxRounds: node.maxRounds } : {}),
    stepIds: leafStepIds(node.steps),
  }
  const routeBase: Omit<ReactFlowRouteEdgeData, "kind"> = routePayload(loopLevel)
  const edges = [...seg.edges]
  connectRoutes(
    edges,
    [node.id],
    seg.entryIds.map((entryId) => ({ entryId, data: routeBase })),
    `loop-${node.id}`,
  )
  let i = 0
  for (const from of seg.exitIds) {
    edges.push({
      id: `route-loop-back-${node.id}-${i++}-${from}-${node.id}`,
      source: from,
      target: node.id,
      sourceHandle: FLOW_OUT_HANDLE,
      targetHandle: FLOW_IN_HANDLE,
      data: { kind: "route", ...routePayload(loopLevel, { loopBack: true }) },
    })
  }
  endStructureFrame(ctx, [node.id, ...nodeIdsInSegment(seg)])
  return {
    nodes: [head, ...seg.nodes],
    edges,
    entryIds: [node.id],
    exitIds: seg.exitIds,
    routeEntries: [{ entryId: node.id, data: routeBase }],
  }
}

function stripStatePrefix(path: string): string {
  return path.startsWith("state.") ? path.slice("state.".length) : path
}

function loopItemsFrameLabel(node: LoopNode): string {
  const parts = ["forEach", `×${node.concurrency ?? 1}`]
  if (node.onError === "continue") parts.push("onError: continue")
  return parts.join(" ")
}

function loopReactFlowNode(node: LoopNode): ReactFlowNode {
  const mode = loopMode(node)
  const refPath = node.ref ? stripStatePrefix(node.ref) : undefined
  const collectPath = node.collect ? stripStatePrefix(node.collect) : undefined
  const inputs: ReactFlowPort[] = []
  const outputs: ReactFlowPort[] = []
  if (refPath !== undefined) {
    inputs.push({
      id: LOOP_REF_HANDLE,
      name: "ref",
      typeLabel: "ref",
      binding: "ref",
      refPath,
    })
  }
  if (node.expr !== undefined) {
    inputs.push({
      id: EXPR_HANDLE_ID,
      name: "expr",
      typeLabel: "expr",
      binding: "expr",
      exprSource: node.expr,
    })
  }
  if (mode === "forEach" && collectPath !== undefined) {
    inputs.push({
      id: LOOP_COLLECT_HANDLE,
      name: "collect",
      typeLabel: "ref",
      binding: "ref",
      refPath: collectPath,
    })
  }
  if ((mode === "for" || mode === "forEach") && node.as) {
    outputs.push({
      id: LOOP_ITEM_HANDLE,
      name: "item",
      typeLabel: mode === "forEach" ? "item" : "integer",
    })
  }
  if (mode === "forEach" && node.into) {
    outputs.push({
      id: LOOP_INTO_HANDLE,
      name: "into",
      typeLabel: "array",
    })
  }
  const data: ReactFlowLoopItemsData = {
    label: node.label ?? node.id,
    mode,
    ...(refPath !== undefined ? { refPath } : {}),
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(collectPath !== undefined ? { collectPath } : {}),
    ...(node.into !== undefined ? { into: node.into } : {}),
    ...(node.expr !== undefined ? { exprBadge: formatExprBadge(node.expr) } : {}),
    ...(node.maxRounds !== undefined ? { maxRounds: node.maxRounds } : {}),
    ...(mode === "forEach"
      ? { concurrency: node.concurrency ?? 1, onError: node.onError ?? "fail" }
      : {}),
    inputs,
    outputs,
  }
  return { id: node.id, type: "ecp-loop", position: { x: 0, y: 0 }, data }
}

function renderLoopForEach(node: LoopNode, ctx: EncodeContext): RenderSegment {
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "loop",
    loopMode: "forEach",
    label: structureFrameLabel(node),
  })
  const head = loopReactFlowNode(node)
  const seg = renderNodes(node.steps, ctx)
  const loopLevel: ReactFlowRouteLevel = {
    route: "loop",
    loopMode: "forEach",
    structureId: node.id,
    stepIds: leafStepIds(node.steps),
  }
  const routeBase: Omit<ReactFlowRouteEdgeData, "kind"> = routePayload(loopLevel)
  const edges = [...seg.edges]
  connectRoutes(
    edges,
    [node.id],
    seg.entryIds.map((entryId) => ({ entryId, data: routeBase })),
    `loop-items-${node.id}`,
  )
  endStructureFrame(ctx, [node.id, ...nodeIdsInSegment(seg)])
  return {
    nodes: [head, ...seg.nodes],
    edges,
    entryIds: [node.id],
    exitIds: seg.exitIds,
  }
}

function renderNode(node: Node, ctx: EncodeContext): RenderSegment {
  if (isStepNode(node)) return renderStep(node, ctx)
  if (node.type === "parallel") return renderParallel(node, ctx)
  if (node.type === "branch") return renderBranch(node, ctx)
  if (node.type === "loop") return renderLoop(node, ctx)
  return { nodes: [], edges: [], entryIds: [], exitIds: [] }
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

function returnsSourceHandle(node: ReactFlowNode): string {
  if (node.type === "ecp-loop") {
    const data = node.data as ReactFlowLoopItemsData
    return data.outputs.some((port) => port.id === LOOP_INTO_HANDLE) ? LOOP_INTO_HANDLE : LOOP_ITEM_HANDLE
  }
  const data = node.data as ReactFlowStepData
  if (data.outputs.some((port) => port.id === OUTPUT_HANDLE_ID)) return OUTPUT_HANDLE_ID
  return data.outputs[0]?.id ?? OUTPUT_HANDLE_ID
}

function lastWriterByKey(nodes: ReactFlowNode[]): Map<string, ReactFlowNode> {
  const out = new Map<string, ReactFlowNode>()
  for (const node of nodes) {
    if (node.type === "ecp-step") {
      const as = (node.data as ReactFlowStepData).as
      if (as) out.set(as, node)
    }
    if (node.type === "ecp-loop") {
      const loopData = node.data as ReactFlowLoopItemsData
      if (loopData.into) out.set(loopData.into, node)
    }
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
      edges.push({
        id: `data-returns-${i}-${writer.id}-${field.name}`,
        source: writer.id,
        target: EXECUTION_RETURNS_NODE_ID,
        sourceHandle: returnsSourceHandle(writer),
        targetHandle: field.name,
        data: { kind: "data", inputPath: field.name, statePath: `state.${field.name}` },
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
      data: { kind: "data", inputPath: field.name, statePath: `state.${field.name}` },
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
    if (edge.sourceHandle && source?.type === "ecp-loop") {
      ensureOutputPort((source.data as ReactFlowLoopItemsData).outputs, edge.sourceHandle)
    }
    const target = nodesById.get(edge.target)
    if (edge.targetHandle && target?.type === "ecp-step") {
      const data = target.data as ReactFlowStepData
      ensureInputPort(data.inputs, edge.targetHandle)
      if (edge.targetHandle === EXPR_HANDLE_ID && !data.exprBadge) data.exprBadge = EXPR_HANDLE_ID
    }
    if (edge.targetHandle && target?.type === "ecp-loop") {
      const loopData = target.data as ReactFlowLoopItemsData
      ensureInputPort(loopData.inputs, edge.targetHandle)
      if (edge.targetHandle === EXPR_HANDLE_ID && !loopData.exprBadge) loopData.exprBadge = EXPR_HANDLE_ID
    }
  }
}

/**
 * Keep layout-only control edges as visible `sequence` routes for nodes that would
 * otherwise have no published edge (C2 orphan guard).
 */
function publishOrphanSequenceEdges(
  nodes: ReactFlowNode[],
  layoutEdges: ReactFlowEdge[],
  exemptNodeIds?: ReadonlySet<string>,
): ReactFlowEdge[] {
  const frameIds = new Set(nodes.filter((node) => node.type === "ecp-frame").map((node) => node.id))
  const published = layoutEdges.filter((edge) => edge.data.kind !== "control")
  const connected = new Set<string>()
  for (const edge of published) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  const orphans = new Set(
    nodes
      .filter(
        (node) =>
          node.type !== "ecp-frame" &&
          !frameIds.has(node.id) &&
          !connected.has(node.id) &&
          !(exemptNodeIds?.has(node.id) ?? false),
      )
      .map((n) => n.id),
  )
  if (orphans.size === 0) return published

  const out = [...published]
  const seen = new Set(published.map((edge) => edge.id))
  for (const edge of layoutEdges) {
    if (edge.data.kind !== "control") continue
    if (!orphans.has(edge.source) && !orphans.has(edge.target)) continue
    const routeEdge: ReactFlowEdge = {
      id: `route-seq-${edge.id}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: FLOW_OUT_HANDLE,
      targetHandle: FLOW_IN_HANDLE,
      data: {
        kind: "route",
        ...routePayload({ route: "sequence", structureId: edge.source }),
      },
    }
    if (seen.has(routeEdge.id)) continue
    seen.add(routeEdge.id)
    out.push(routeEdge)
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return out
}

interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

function unionRect(a: FrameRect, b: FrameRect): FrameRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: x2 - x, height: y2 - y }
}

function frameNodesForStructures(
  laid: ReactFlowDocument,
  frames: readonly StructureFrame[],
  options?: ReactFlowEncodeOptions,
  detachedStructureIds?: ReadonlySet<string>,
): ReactFlowNode[] {
  const nodeWidth = options?.nodeWidth ?? 260
  const nodeHeight = options?.nodeHeight ?? 160
  const rects = new Map<string, FrameRect>()
  const byDepth = [...frames].sort((a, b) => b.depth - a.depth)

  for (const spec of byDepth) {
    let inner = boundsAroundNodeIds(laid.nodes, spec.memberNodeIds, nodeWidth, nodeHeight)
    for (const childId of spec.childFrameIds) {
      const child = rects.get(childId)
      if (!child) continue
      inner = inner ? unionRect(inner, child) : child
    }
    if (!inner) continue
    const pad = FRAME_PADDING
    const labelGap = pad.label
    rects.set(spec.frameId, {
      x: inner.x - pad.x,
      y: inner.y - pad.y - labelGap,
      width: inner.width + pad.x * 2,
      height: inner.height + pad.y * 2 + labelGap,
    })
  }

  const out: ReactFlowNode[] = []
  for (const spec of frames) {
    const rect = rects.get(spec.frameId)
    if (!rect) continue
    const data: ReactFlowFrameData = {
      structureId: spec.structureId,
      structureKind: spec.structureKind,
      ...(spec.loopMode !== undefined ? { loopMode: spec.loopMode } : {}),
      label: spec.label,
      ...(detachedStructureIds?.has(spec.structureId) ? { detached: true } : {}),
    }
    out.push({
      id: spec.frameId,
      type: "ecp-frame",
      position: { x: rect.x, y: rect.y },
      style: {
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      },
      zIndex: spec.depth,
      data,
    })
  }
  return out
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
  const structureFrames: StructureFrame[] = []
  const ctx: EncodeContext = { capabilitySchemas: options?.capabilitySchemas, structureFrames, frameStack: [] }
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
    if (node.type === "ecp-step") {
      const data = node.data as ReactFlowStepData
      outputPortIds.set(node.id, data.outputs.map((port) => port.id))
      inputPortIds.set(node.id, data.inputs.map((port) => port.id))
    }
    if (node.type === "ecp-loop") {
      const data = node.data as ReactFlowLoopItemsData
      outputPortIds.set(node.id, data.outputs.map((port) => port.id))
      inputPortIds.set(node.id, data.inputs.map((port) => port.id))
    }
  }

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const dataEdges = [
    ...extractDataEdges(steps, acceptsKeys, outputPortIds, inputPortIds),
    ...extractExprEdges(steps, acceptsKeys, outputPortIds),
    ...extractReturnsEdges(manifest, [...body.nodes]),
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
  let flowNodes = laid.nodes
  const detachedRoots = Array.isArray(manifest.detached) ? manifest.detached : []
  const detachedStructureIds = new Set<string>()
  const detachedEntityIds = new Set<string>()

  if (detachedRoots.length > 0) {
    const detachedFrames: StructureFrame[] = []
    const detachedCtx: EncodeContext = {
      capabilitySchemas: options?.capabilitySchemas,
      structureFrames: detachedFrames,
      frameStack: [],
    }
    const detachedSeg = renderNodes(detachedRoots, detachedCtx)
    const controlEdges = detachedSeg.edges.filter((edge) => edge.data.kind === "control")
    const detachedLaid = layoutReactFlowDocument({ nodes: detachedSeg.nodes, edges: controlEdges }, options)
    const mainMaxY = flowNodes.reduce((max, node) => {
      const height = node.style?.height ?? options?.nodeHeight ?? 160
      return Math.max(max, node.position.y + height)
    }, 0)
    const mainMinX = flowNodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const detachedMinY = detachedLaid.nodes.reduce((min, node) => Math.min(min, node.position.y), Infinity)
    const detachedMinX = detachedLaid.nodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const dy = mainMaxY + 48 - detachedMinY
    const dx = mainMinX - detachedMinX
    const stampDetached = (node: ReactFlowNode): ReactFlowNode => {
      detachedEntityIds.add(node.id)
      if (node.type === "ecp-step" || node.type === "ecp-loop") {
        return { ...node, data: { ...node.data, detached: true } }
      }
      return node
    }
    const translated = detachedLaid.nodes.map((node) =>
      stampDetached({
        ...node,
        position: { x: node.position.x + dx, y: node.position.y + dy },
      }),
    )
    flowNodes = [...flowNodes, ...translated]
    structureFrames.push(...detachedFrames)
    for (const root of detachedRoots) {
      detachedStructureIds.add(root.id)
      const walk = (n: Node): void => {
        detachedStructureIds.add(n.id)
        if (n.type === "branch") for (const arm of n.branches) for (const child of arm.steps) walk(child)
        else if (n.type === "parallel") for (const line of n.branches) for (const child of line) walk(child)
        else if (n.type === "loop") for (const child of n.steps) walk(child)
      }
      walk(root)
    }
  }

  const laidForFrames = { nodes: flowNodes, edges: laid.edges }
  const frames = frameNodesForStructures(laidForFrames, structureFrames, options, detachedStructureIds)
  const allNodes = [...frames, ...flowNodes]
  return {
    nodes: allNodes,
    edges: publishOrphanSequenceEdges(allNodes, laid.edges, detachedEntityIds),
  }
}