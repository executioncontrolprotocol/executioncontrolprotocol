import type { ExecutionManifest, IfNode, LoopNode, Node, ParallelNode, StepNode } from "@executioncontrolprotocol/protocol"
import { extractDataEdges, OUTPUT_HANDLE_ID } from "./extract-data-edges.js"
import {
  acceptsPropertyKeys,
  acceptsReactFlowNode,
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  isStepNode,
  returnsReactFlowNode,
} from "./io-from-schema.js"
import { jsonSchemaObjectProperties } from "./json-schema.js"
import {
  adjustFrameRectForPins,
  applyContainerGeometry,
  pinContainers,
  type StructureFrameGeometry,
} from "./container-geometry.js"
import { frameBounds, layoutReactFlowDocument, type LayoutCluster } from "./layout.js"
import { ensureInputPort, ensureOutputPort, portsForStep } from "./ports-from-schema.js"
import { refPathFromValue } from "./markers.js"
import { portsFromJsonSchemaObject } from "./io-from-schema.js"
import type {
  CapabilitySchemaIndex,
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
  ReactFlowEndData,
  ReactFlowFrameData,
  ReactFlowIfData,
  ReactFlowLoopItemsData,
  ReactFlowNode,
  ReactFlowParallelData,
  ReactFlowPort,
  ReactFlowStepData,
} from "./types.js"
import {
  END_REPEAT_HANDLE,
  END_RESULTS_HANDLE,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  loopEndNodeId,
} from "./types.js"

interface StructureFrame extends StructureFrameGeometry {
  structureId: string
  loopMode?: "while" | "for" | "forEach"
  label: string
  startNodeId: string
  endNodeId?: string
  bands: StructureFrameGeometry["bands"]
}

interface EncodeContext {
  capabilitySchemas: CapabilitySchemaIndex | undefined
  structureFrames: StructureFrame[]
  frameStack: { spec: StructureFrame }[]
}

interface RenderSegment {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  entryIds: string[]
  exitIds: string[]
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
    bands: [],
    startNodeId: "",
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

function layoutClusters(frames: readonly StructureFrame[]): LayoutCluster[] {
  const out: LayoutCluster[] = []
  for (const frame of frames) {
    for (const band of frame.bands) {
      out.push({ id: band.bandId, memberNodeIds: band.memberNodeIds, childClusterIds: [] })
    }
    const frameMembers = [frame.startNodeId, ...(frame.endNodeId ? [frame.endNodeId] : [])]
    const childClusterIds = [...frame.bands.map((band) => band.bandId), ...frame.childFrameIds]
    out.push({ id: frame.frameId, memberNodeIds: frameMembers, childClusterIds })
  }
  return out
}

function connectControl(edges: ReactFlowEdge[], fromIds: string[], toIds: string[], prefix: string): void {
  let i = 0
  for (const from of fromIds) {
    for (const to of toIds) {
      edges.push({ id: `ctrl-${prefix}-${i++}-${from}-${to}`, source: from, target: to, data: { kind: "control" } })
    }
  }
}

function structureFrameLabel(node: IfNode | ParallelNode | LoopNode): string {
  if (node.label) return node.label
  if (node.type === "if") return "if"
  if (node.type === "parallel") return "parallel"
  const mode = node.mode ?? "while"
  if (mode === "forEach") return "forEach"
  if (mode === "while") return "while"
  return "for"
}

function loopMode(node: LoopNode): "while" | "for" | "forEach" {
  return node.mode ?? "while"
}

function nodeIdsInSegment(seg: RenderSegment): string[] {
  return seg.nodes.map((node) => node.id)
}

function renderStep(node: StepNode, ctx: EncodeContext): RenderSegment {
  const ports = portsForStep(node, ctx.capabilitySchemas?.[node.uses])
  const data: ReactFlowStepData = {
    label: node.label ?? node.id,
    uses: node.uses,
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(node.mode !== undefined ? { mode: node.mode } : {}),
    ...(node.config !== undefined ? { config: node.config } : {}),
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

function ifPorts(node: IfNode): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const inputs = portsFromJsonSchemaObject(node.accepts)
  const outputs: ReactFlowPort[] = [
    { id: IF_THEN_HANDLE, name: "then", typeLabel: "unknown" },
    { id: IF_ELSE_HANDLE, name: "else", typeLabel: "unknown" },
  ]
  if (node.input) {
    for (const [key, value] of Object.entries(node.input)) {
      const ref = refPathFromValue(value)
      const port = inputs.find((p) => p.id === key) ?? { id: key, name: key, typeLabel: "unknown" }
      if (ref) {
        port.binding = "ref"
        port.refPath = ref.startsWith("state.") ? ref.slice(6) : ref
      }
    }
  }
  return { inputs, outputs }
}

function ifReactFlowNode(node: IfNode): ReactFlowNode {
  const ports = ifPorts(node)
  const data: ReactFlowIfData = {
    label: node.label ?? node.id,
    ...(node.expression !== undefined ? { expression: node.expression } : {}),
    ...(node.as !== undefined ? { as: node.as } : {}),
    inputs: ports.inputs,
    outputs: ports.outputs,
  }
  return { id: node.id, type: "ecp-if", position: { x: 0, y: 0 }, data }
}

function parallelPorts(node: ParallelNode): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const inputs = portsFromJsonSchemaObject(node.accepts)
  const outputs = node.paths.map((_, index) => ({
    id: `${PARALLEL_PATH_HANDLE_PREFIX}${index + 1}`,
    name: `path ${index + 1}`,
    typeLabel: "unknown",
  }))
  return { inputs, outputs }
}

function parallelReactFlowNode(node: ParallelNode): ReactFlowNode {
  const ports = parallelPorts(node)
  const data: ReactFlowParallelData = {
    label: node.label ?? node.id,
    pathCount: node.paths.length,
    ...(node.as !== undefined ? { as: node.as } : {}),
    inputs: ports.inputs,
    outputs: ports.outputs,
  }
  return { id: node.id, type: "ecp-parallel", position: { x: 0, y: 0 }, data }
}

function loopReactFlowNode(node: LoopNode): ReactFlowNode {
  const mode = loopMode(node)
  const inputs: ReactFlowPort[] = []
  const outputs: ReactFlowPort[] = []
  if (mode === "forEach") {
    inputs.push({ id: LOOP_ITEMS_HANDLE, name: "items", typeLabel: "array" })
    if (node.as) {
      outputs.push({ id: LOOP_ITEM_HANDLE, name: "item", typeLabel: "unknown" })
      outputs.push({ id: LOOP_INDEX_HANDLE, name: "index", typeLabel: "integer" })
    }
  } else if (mode === "for") {
    inputs.push({ id: LOOP_COUNT_HANDLE, name: "count", typeLabel: "integer" })
    if (node.as) outputs.push({ id: LOOP_INDEX_HANDLE, name: "index", typeLabel: "integer" })
  }
  const data: ReactFlowLoopItemsData = {
    label: node.label ?? node.id,
    mode,
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(node.into !== undefined ? { into: node.into } : {}),
    ...(node.maxRounds !== undefined ? { maxRounds: node.maxRounds } : {}),
    ...(mode === "forEach" ? { concurrency: node.concurrency ?? 1, onError: node.onError ?? "fail" } : {}),
    inputs,
    outputs,
  }
  return { id: node.id, type: "ecp-loop", position: { x: 0, y: 0 }, data }
}

function endReactFlowNode(node: LoopNode): ReactFlowNode {
  const mode = loopMode(node)
  const inputs: ReactFlowPort[] = [{ id: "value", name: "value", typeLabel: "unknown" }]
  if (mode === "while") {
    inputs.push({ id: END_REPEAT_HANDLE, name: "repeat", typeLabel: "boolean" })
  }
  const outputs: ReactFlowPort[] = [{ id: END_RESULTS_HANDLE, name: "results", typeLabel: "unknown" }]
  const data: ReactFlowEndData = {
    loopId: node.id,
    label: "end",
    inputs,
    outputs,
  }
  return { id: loopEndNodeId(node.id), type: "ecp-end", position: { x: 0, y: 0 }, data }
}

function renderIf(node: IfNode, ctx: EncodeContext): RenderSegment {
  const head = ifReactFlowNode(node)
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "if",
    label: structureFrameLabel(node),
  })
  const frameSpec = ctx.frameStack[ctx.frameStack.length - 1]?.spec
  if (frameSpec) frameSpec.startNodeId = node.id
  const thenSeg = renderNodes(node.then, ctx)
  const elseSeg = node.else ? renderNodes(node.else, ctx) : { nodes: [], edges: [], entryIds: [], exitIds: [] }
  const thenIds = nodeIdsInSegment(thenSeg)
  const elseIds = nodeIdsInSegment(elseSeg)
  const bands: StructureFrame["bands"] = [
    { bandId: `ecp:band:${node.id}:then`, label: "then", memberNodeIds: thenIds },
  ]
  if (node.else) bands.push({ bandId: `ecp:band:${node.id}:else`, label: "else", memberNodeIds: elseIds })
  if (frameSpec) frameSpec.bands = bands
  const memberIds = new Set<string>([node.id, ...thenIds, ...elseIds])
  const edges = [...thenSeg.edges, ...elseSeg.edges]
  if (thenSeg.entryIds.length > 0) connectControl(edges, [node.id], thenSeg.entryIds, `if-then-${node.id}`)
  if (elseSeg.entryIds.length > 0) connectControl(edges, [node.id], elseSeg.entryIds, `if-else-${node.id}`)
  endStructureFrame(ctx, [...memberIds])
  return {
    nodes: [head, ...thenSeg.nodes, ...elseSeg.nodes],
    edges,
    entryIds: [node.id],
    exitIds: [...thenSeg.exitIds, ...elseSeg.exitIds],
  }
}

function renderParallel(node: ParallelNode, ctx: EncodeContext): RenderSegment {
  const head = parallelReactFlowNode(node)
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "parallel",
    label: structureFrameLabel(node),
  })
  const frameSpec = ctx.frameStack[ctx.frameStack.length - 1]?.spec
  if (frameSpec) frameSpec.startNodeId = node.id
  const out: RenderSegment = { nodes: [head], edges: [], entryIds: [node.id], exitIds: [] }
  const memberIds = new Set<string>([node.id])
  const bands: StructureFrame["bands"] = []
  node.paths.forEach((path, index) => {
    const seg = renderNodes(path, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    const pathIds = nodeIdsInSegment(seg)
    for (const id of pathIds) memberIds.add(id)
    bands.push({
      bandId: `ecp:band:${node.id}:path-${index + 1}`,
      label: `path ${index + 1}`,
      memberNodeIds: pathIds,
    })
    if (seg.entryIds.length > 0) connectControl(out.edges, [node.id], seg.entryIds, `par-${node.id}-${index}`)
    out.exitIds.push(...seg.exitIds)
  })
  if (frameSpec) frameSpec.bands = bands
  endStructureFrame(ctx, [...memberIds])
  return out
}

function renderLoop(node: LoopNode, ctx: EncodeContext): RenderSegment {
  const head = loopReactFlowNode(node)
  const endNode = endReactFlowNode(node)
  beginStructureFrame(ctx, {
    frameId: `ecp:frame:${node.id}`,
    structureId: node.id,
    structureKind: "loop",
    loopMode: loopMode(node),
    label: structureFrameLabel(node),
  })
  const frameSpec = ctx.frameStack[ctx.frameStack.length - 1]?.spec
  if (frameSpec) {
    frameSpec.startNodeId = node.id
    frameSpec.endNodeId = endNode.id
  }
  const seg = renderNodes(node.steps, ctx)
  const edges = [...seg.edges]
  const bodyIds = nodeIdsInSegment(seg)
  if (frameSpec) {
    frameSpec.bands = [{ bandId: `ecp:band:${node.id}:body`, label: "body", memberNodeIds: bodyIds }]
  }
  const memberIds = new Set<string>([node.id, endNode.id, ...bodyIds])
  if (seg.entryIds.length > 0) connectControl(edges, [node.id], seg.entryIds, `loop-body-${node.id}`)
  if (seg.exitIds.length > 0) connectControl(edges, seg.exitIds, [endNode.id], `loop-end-${node.id}`)
  else connectControl(edges, [node.id], [endNode.id], `loop-end-empty-${node.id}`)
  endStructureFrame(ctx, [...memberIds])
  return {
    nodes: [head, ...seg.nodes, endNode],
    edges,
    entryIds: [node.id],
    exitIds: [endNode.id],
  }
}

function renderNode(node: Node, ctx: EncodeContext): RenderSegment {
  if (isStepNode(node)) return renderStep(node, ctx)
  if (node.type === "if") return renderIf(node, ctx)
  if (node.type === "parallel") return renderParallel(node, ctx)
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
    if (out.entryIds.length === 0) out.entryIds = seg.entryIds
    else connectControl(out.edges, out.exitIds, seg.entryIds, `seq-${index}`)
    out.exitIds = seg.exitIds
  })
  return out
}

function returnsSourceHandle(node: ReactFlowNode): string {
  if (node.type === "ecp-end") return END_RESULTS_HANDLE
  if (node.type === "ecp-loop") {
    const data = node.data as ReactFlowLoopItemsData
    return data.outputs[0]?.id ?? LOOP_ITEM_HANDLE
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
    if (node.type === "ecp-end") {
      const loopId = (node.data as ReactFlowEndData).loopId
      const loop = nodes.find((n) => n.id === loopId)
      const into = loop?.type === "ecp-loop" ? (loop.data as ReactFlowLoopItemsData).into : undefined
      if (into) out.set(into, node)
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
    const target = nodesById.get(edge.target)
    const portLists = (node: ReactFlowNode | undefined): ReactFlowPort[] | undefined => {
      if (!node) return undefined
      if (node.type === "ecp-step") return (node.data as ReactFlowStepData).outputs
      if (node.type === "ecp-loop") return (node.data as ReactFlowLoopItemsData).outputs
      if (node.type === "ecp-if") return (node.data as ReactFlowIfData).outputs
      if (node.type === "ecp-parallel") return (node.data as ReactFlowParallelData).outputs
      if (node.type === "ecp-end") return (node.data as ReactFlowEndData).outputs
      if (node.type === "ecp-io") return (node.data as { outputs: ReactFlowPort[] }).outputs
      return undefined
    }
    const inputLists = (node: ReactFlowNode | undefined): ReactFlowPort[] | undefined => {
      if (!node) return undefined
      if (node.type === "ecp-step") return (node.data as ReactFlowStepData).inputs
      if (node.type === "ecp-loop") return (node.data as ReactFlowLoopItemsData).inputs
      if (node.type === "ecp-if") return (node.data as ReactFlowIfData).inputs
      if (node.type === "ecp-parallel") return (node.data as ReactFlowParallelData).inputs
      if (node.type === "ecp-end") return (node.data as ReactFlowEndData).inputs
      if (node.type === "ecp-io") return (node.data as { inputs: ReactFlowPort[] }).inputs
      return undefined
    }
    if (edge.sourceHandle) ensureOutputPort(portLists(source) ?? [], edge.sourceHandle)
    if (edge.targetHandle) ensureInputPort(inputLists(target) ?? [], edge.targetHandle)
  }
}

function publishEdges(layoutEdges: ReactFlowEdge[]): ReactFlowEdge[] {
  return layoutEdges.filter((edge) => edge.data.kind !== "control")
}

function frameNodesForStructures(
  laid: ReactFlowDocument,
  frames: readonly StructureFrame[],
  options?: ReactFlowEncodeOptions,
  detachedStructureIds?: ReadonlySet<string>,
): ReactFlowNode[] {
  const nodeWidth = options?.nodeWidth ?? 260
  const nodeHeight = options?.nodeHeight ?? 160
  const rects = frameBounds(laid.nodes, frames, { nodeWidth, nodeHeight, headerless: true })
  const out: ReactFlowNode[] = []
  for (const spec of frames) {
    const rawRect = rects.get(spec.frameId)
    if (!rawRect) continue
    const rect = adjustFrameRectForPins(rawRect, laid.nodes, spec, nodeWidth)
    const data: ReactFlowFrameData = {
      structureId: spec.structureId,
      structureKind: spec.structureKind,
      ...(spec.loopMode !== undefined ? { loopMode: spec.loopMode } : {}),
      label: spec.label,
      startNodeId: spec.startNodeId,
      ...(spec.endNodeId !== undefined ? { endNodeId: spec.endNodeId } : {}),
      bands: spec.bands.map((band) => ({
        bandId: band.bandId,
        label: band.label,
        memberNodeIds: [...band.memberNodeIds],
      })),
      ...(spec.bandDividerYs !== undefined ? { bandDividerYs: [...spec.bandDividerYs] } : {}),
      memberNodeIds: [...spec.memberNodeIds],
      childFrameIds: [...spec.childFrameIds],
      depth: spec.depth,
      ...(detachedStructureIds?.has(spec.structureId) ? { detached: true } : {}),
    }
    out.push({
      id: spec.frameId,
      type: "ecp-frame",
      position: { x: rect.x, y: rect.y },
      style: { width: rect.width, height: rect.height, pointerEvents: "none" },
      zIndex: spec.depth,
      data,
    })
  }
  return out
}

function walkDetachedIds(node: Node, ids: Set<string>): void {
  ids.add(node.id)
  if (node.type === "if") {
    for (const child of [...node.then, ...(node.else ?? [])]) walkDetachedIds(child, ids)
  } else if (node.type === "parallel") {
    for (const path of node.paths) for (const child of path) walkDetachedIds(child, ids)
  } else if (node.type === "loop") {
    for (const child of node.steps) walkDetachedIds(child, ids)
  }
}

/**
 * Convert an execution manifest into a positioned React Flow document.
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
    const portKind = node.type
    if (portKind === "ecp-step") {
      const data = node.data as ReactFlowStepData
      outputPortIds.set(node.id, data.outputs.map((port) => port.id))
      inputPortIds.set(node.id, data.inputs.map((port) => port.id))
    } else if (portKind === "ecp-loop" || portKind === "ecp-if" || portKind === "ecp-parallel" || portKind === "ecp-end") {
      const data = node.data as { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] }
      outputPortIds.set(node.id, data.outputs.map((port) => port.id))
      inputPortIds.set(node.id, data.inputs.map((port) => port.id))
    }
  }

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const dataEdges = [...extractDataEdges(steps, acceptsKeys, outputPortIds, inputPortIds), ...extractReturnsEdges(manifest, [...body.nodes])]
  ensureEdgePorts(nodesById, dataEdges)

  const layoutEdges: ReactFlowEdge[] = [...body.edges, ...dataEdges]
  if (body.entryIds.length > 0) connectControl(layoutEdges, [acceptsNode.id], body.entryIds, "io-accepts")
  else if (returnsNode) connectControl(layoutEdges, [acceptsNode.id], [returnsNode.id], "io-empty")
  if (returnsNode && body.exitIds.length > 0) connectControl(layoutEdges, body.exitIds, [returnsNode.id], "io-returns")

  const laid = layoutReactFlowDocument({ nodes, edges: layoutEdges }, options, layoutClusters(structureFrames))
  const geometryLaid = applyContainerGeometry(laid, structureFrames, options)
  let flowNodes = geometryLaid.nodes
  const detachedRoots = Array.isArray(manifest.detached) ? manifest.detached : []
  const detachedStructureIds = new Set<string>()

  if (detachedRoots.length > 0) {
    const detachedFrames: StructureFrame[] = []
    const detachedCtx: EncodeContext = {
      capabilitySchemas: options?.capabilitySchemas,
      structureFrames: detachedFrames,
      frameStack: [],
    }
    const detachedSeg = renderNodes(detachedRoots, detachedCtx)
    const controlEdges = detachedSeg.edges.filter((edge) => edge.data.kind === "control")
    const detachedLayout = layoutReactFlowDocument(
      { nodes: detachedSeg.nodes, edges: controlEdges },
      options,
      layoutClusters(detachedFrames),
    )
    const detachedLaid = applyContainerGeometry(detachedLayout, detachedFrames, options)
    const mainMaxY = flowNodes.reduce((max, node) => Math.max(max, node.position.y + (node.style?.height ?? 160)), 0)
    const mainMinX = flowNodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const detachedMinY = detachedLaid.nodes.reduce((min, node) => Math.min(min, node.position.y), Infinity)
    const detachedMinX = detachedLaid.nodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const dy = mainMaxY + 48 - detachedMinY
    const dx = mainMinX - detachedMinX
    const translated = detachedLaid.nodes.map((node) => ({
      ...node,
      position: { x: node.position.x + dx, y: node.position.y + dy },
      data: { ...node.data, detached: true },
    }))
    flowNodes = [...flowNodes, ...translated]
    structureFrames.push(...detachedFrames)
    for (const root of detachedRoots) walkDetachedIds(root, detachedStructureIds)
  }

  const laidForFrames = { nodes: flowNodes, edges: geometryLaid.edges }
  const frames = frameNodesForStructures(laidForFrames, structureFrames, options, detachedStructureIds)
  return { nodes: pinContainers([...frames, ...flowNodes]), edges: publishEdges(geometryLaid.edges) }
}