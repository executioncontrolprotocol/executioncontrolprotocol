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
  documentMaxY,
  treeLayoutReactFlowDocument,
  translateDocumentNodes,
  TREE_END_HEIGHT,
  TREE_END_WIDTH,
  TREE_GAP_X,
} from "./tree-layout.js"
import { loopsCrossedBetween, typeLabelCrossingLoops } from "./loop-export-type.js"
import { ensureInputPort, ensureOutputPort, portsForStep } from "./ports-from-schema.js"
import { refPathsFromValue } from "./markers.js"
import { portsFromJsonSchemaObject } from "./io-from-schema.js"
import {
  computeAllTunnelRects,
  computeTunnelRect,
} from "./tunnel-geometry.js"
import type {
  CapabilitySchemaIndex,
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEncodeOptions,
  ReactFlowEndData,
  ReactFlowIfData,
  ReactFlowLoopItemsData,
  ReactFlowNode,
  ReactFlowParallelData,
  ReactFlowPort,
  ReactFlowStepData,
  ReactFlowTunnelData,
  ReactFlowTunnelKind,
  TunnelSpec,
} from "./types.js"
import {
  EMPTY_INPUT_PORT_ID,
  IF_ELSE_HANDLE,
  IF_THEN_HANDLE,
  LOOP_COUNT_HANDLE,
  LOOP_INDEX_HANDLE,
  LOOP_ITEM_HANDLE,
  LOOP_ITEMS_HANDLE,
  PARALLEL_PATH_HANDLE_PREFIX,
  structureEndNodeId,
} from "./types.js"

interface EncodeContext {
  manifest: ExecutionManifest
  capabilitySchemas: CapabilitySchemaIndex | undefined
  capabilityMeta: Record<string, { contract?: "step"; code?: "script" | "expression" }> | undefined
  tunnels: TunnelSpec[]
  tunnelStack: { childTunnelIds: string[] }[]
}

function withEmptyInputPort(inputs: ReactFlowPort[]): ReactFlowPort[] {
  if (inputs.some((port) => port.id === EMPTY_INPUT_PORT_ID)) return inputs
  return [...inputs, { id: EMPTY_INPUT_PORT_ID, name: "", typeLabel: "unknown", required: false }]
}

function stepUsesMultiCardinal(step: StepNode, ctx: EncodeContext): boolean {
  if (step.accepts !== undefined) return true
  const meta = ctx.capabilityMeta?.[step.uses]
  return meta?.contract === "step" && meta?.code === "script"
}

interface RenderSegment {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  entryIds: string[]
  exitIds: string[]
}

function tunnelId(structureId: string, kind: ReactFlowTunnelKind, pathIndex?: number): string {
  if (kind === "path" && pathIndex !== undefined) return `ecp:tunnel:${structureId}:path-${pathIndex + 1}`
  return `ecp:tunnel:${structureId}:${kind}`
}

/** Layout-only placeholder id for an empty branch. @category App */
export function sidePlaceholderId(structureId: string, sideKey: string): string {
  return `ecp:placeholder:${structureId}:${sideKey}`
}

function sidePlaceholderNode(structureId: string, sideKey: string): ReactFlowNode {
  return {
    id: sidePlaceholderId(structureId, sideKey),
    type: "ecp-placeholder",
    position: { x: 0, y: 0 },
    style: { width: 1, height: 1 },
    data: { label: "" } satisfies import("./types.js").ReactFlowPlaceholderData,
  }
}

function registerTunnel(
  ctx: EncodeContext,
  spec: Omit<TunnelSpec, "depth" | "childTunnelIds">,
): void {
  const parent = ctx.tunnelStack[ctx.tunnelStack.length - 1]
  const entry: TunnelSpec = {
    ...spec,
    childTunnelIds: [],
    depth: ctx.tunnelStack.length,
  }
  if (parent) parent.childTunnelIds.push(entry.tunnelId)
  ctx.tunnels.push(entry)
}

function connectControl(edges: ReactFlowEdge[], fromIds: string[], toIds: string[], prefix: string): void {
  let i = 0
  for (const from of fromIds) {
    for (const to of toIds) {
      edges.push({ id: `ctrl-${prefix}-${i++}-${from}-${to}`, source: from, target: to, data: { kind: "control" } })
    }
  }
}

function structureLabel(node: IfNode | ParallelNode | LoopNode): string {
  if (node.label) return node.label
  if (node.type === "if") return "if"
  if (node.type === "parallel") return "parallel"
  if (node.mode === "forEach") return "forEach"
  return "for"
}

function loopMode(node: LoopNode): "for" | "forEach" {
  return node.mode
}

function nodeIdsInSegment(seg: RenderSegment): string[] {
  return seg.nodes.map((node) => node.id)
}

function renderStep(node: StepNode, ctx: EncodeContext): RenderSegment {
  const ports = portsForStep(node, ctx.capabilitySchemas?.[node.uses])
  if (stepUsesMultiCardinal(node, ctx)) ports.inputs = withEmptyInputPort(ports.inputs)
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
      const paths = refPathsFromValue(value)
      const port = inputs.find((p) => p.id === key) ?? { id: key, name: key, typeLabel: "unknown" }
      if (paths && paths.length > 0) {
        port.binding = "ref"
        port.refPath = paths.map((ref) => (ref.startsWith("state.") ? ref.slice(6) : ref)).join(", ")
        if (paths.length > 1) port.refBranchCount = paths.length
      }
    }
  }
  return { inputs: withEmptyInputPort(inputs), outputs }
}

function ifReactFlowNode(node: IfNode): ReactFlowNode {
  const ports = ifPorts(node)
  const data: ReactFlowIfData = {
    controlKind: "if",
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
  return { inputs: withEmptyInputPort(inputs), outputs }
}

function parallelReactFlowNode(node: ParallelNode): ReactFlowNode {
  const ports = parallelPorts(node)
  const data: ReactFlowParallelData = {
    controlKind: "parallel",
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
    controlKind: mode,
    label: node.label ?? node.id,
    ...(node.as !== undefined ? { as: node.as } : {}),
    ...(mode === "forEach" ? { concurrency: node.concurrency ?? 1, onError: node.onError ?? "fail" } : {}),
    inputs,
    outputs,
  }
  return { id: node.id, type: "ecp-loop", position: { x: 0, y: 0 }, data }
}

function endReactFlowNode(
  structureId: string,
  structureKind: ReactFlowEndData["structureKind"],
  label: string,
): ReactFlowNode {
  const data: ReactFlowEndData = { structureId, structureKind, label }
  return {
    id: structureEndNodeId(structureId),
    type: "ecp-end",
    position: { x: 0, y: 0 },
    style: { width: TREE_END_WIDTH, height: TREE_END_HEIGHT },
    data,
  }
}

function renderIf(node: IfNode, ctx: EncodeContext): RenderSegment {
  const head = ifReactFlowNode(node)
  const endId = structureEndNodeId(node.id)
  const endNode = endReactFlowNode(node.id, "if", "end if")
  ctx.tunnelStack.push({ childTunnelIds: [] })
  const thenSeg = renderNodes(node.then, ctx)
  const elseSeg = node.else ? renderNodes(node.else, ctx) : { nodes: [], edges: [], entryIds: [], exitIds: [] }
  const thenIds = nodeIdsInSegment(thenSeg)
  const elseIds = nodeIdsInSegment(elseSeg)
  ctx.tunnelStack.pop()

  const placeholderNodes: ReactFlowNode[] = []
  let thenSideIds = thenIds
  let elseSideIds = elseIds
  if (thenIds.length === 0) {
    const ph = sidePlaceholderNode(node.id, "then")
    placeholderNodes.push(ph)
    thenSideIds = [ph.id]
  }
  if (elseIds.length === 0) {
    const ph = sidePlaceholderNode(node.id, "else")
    placeholderNodes.push(ph)
    elseSideIds = [ph.id]
  }

  registerTunnel(ctx, {
    tunnelId: tunnelId(node.id, "then"),
    structureId: node.id,
    tunnelKind: "then",
    label: "then",
    controlNodeId: node.id,
    endNodeId: endId,
    sideNodeIds: thenSideIds,
    memberNodeIds: thenSideIds,
  })
  registerTunnel(ctx, {
    tunnelId: tunnelId(node.id, "else"),
    structureId: node.id,
    tunnelKind: "else",
    label: "else",
    controlNodeId: node.id,
    endNodeId: endId,
    sideNodeIds: elseSideIds,
    memberNodeIds: elseSideIds,
  })

  const edges = [...thenSeg.edges, ...elseSeg.edges]
  if (thenSeg.entryIds.length > 0) connectControl(edges, [node.id], thenSeg.entryIds, `if-then-${node.id}`)
  else connectControl(edges, [node.id], thenSideIds, `if-then-ph-${node.id}`)
  if (elseSeg.entryIds.length > 0) connectControl(edges, [node.id], elseSeg.entryIds, `if-else-${node.id}`)
  else if (node.else) connectControl(edges, [node.id], elseSideIds, `if-else-ph-${node.id}`)
  else connectControl(edges, [node.id], elseSideIds, `if-else-empty-${node.id}`)
  if (thenSeg.exitIds.length > 0) connectControl(edges, thenSeg.exitIds, [endId], `if-then-end-${node.id}`)
  else connectControl(edges, thenSideIds, [endId], `if-then-empty-${node.id}`)
  if (elseSeg.exitIds.length > 0) connectControl(edges, elseSeg.exitIds, [endId], `if-else-end-${node.id}`)
  else connectControl(edges, elseSideIds, [endId], `if-else-end-empty-${node.id}`)

  return {
    nodes: [head, endNode, ...placeholderNodes, ...thenSeg.nodes, ...elseSeg.nodes],
    edges,
    entryIds: [node.id],
    exitIds: [endId],
  }
}

function renderParallel(node: ParallelNode, ctx: EncodeContext): RenderSegment {
  const head = parallelReactFlowNode(node)
  const endId = structureEndNodeId(node.id)
  const endNode = endReactFlowNode(node.id, "parallel", "end parallel")
  ctx.tunnelStack.push({ childTunnelIds: [] })
  const out: RenderSegment = { nodes: [head, endNode], edges: [], entryIds: [node.id], exitIds: [endId] }
  node.paths.forEach((path, index) => {
    const seg = renderNodes(path, ctx)
    out.nodes.push(...seg.nodes)
    out.edges.push(...seg.edges)
    const pathIds = nodeIdsInSegment(seg)
    const pathKey = `path-${index + 1}`
    let sideIds = pathIds
    if (pathIds.length === 0) {
      const ph = sidePlaceholderNode(node.id, pathKey)
      out.nodes.push(ph)
      sideIds = [ph.id]
    }
    registerTunnel(ctx, {
      tunnelId: tunnelId(node.id, "path", index),
      structureId: node.id,
      tunnelKind: "path",
      label: `path ${index + 1}`,
      controlNodeId: node.id,
      endNodeId: endId,
      sideNodeIds: sideIds,
      memberNodeIds: sideIds,
    })
    if (seg.entryIds.length > 0) connectControl(out.edges, [node.id], seg.entryIds, `par-${node.id}-${index}`)
    else connectControl(out.edges, [node.id], sideIds, `par-ph-${node.id}-${index}`)
    if (seg.exitIds.length > 0) connectControl(out.edges, seg.exitIds, [endId], `par-end-${node.id}-${index}`)
    else connectControl(out.edges, sideIds, [endId], `par-empty-${node.id}-${index}`)
  })
  ctx.tunnelStack.pop()
  return out
}

function renderLoop(node: LoopNode, ctx: EncodeContext): RenderSegment {
  const head = loopReactFlowNode(node)
  const endId = structureEndNodeId(node.id)
  const endNode = endReactFlowNode(node.id, "loop", "end loop")
  ctx.tunnelStack.push({ childTunnelIds: [] })
  const seg = renderNodes(node.steps, ctx)
  const bodyIds = nodeIdsInSegment(seg)
  registerTunnel(ctx, {
    tunnelId: tunnelId(node.id, "loop"),
    structureId: node.id,
    tunnelKind: "loop",
    label: structureLabel(node),
    controlNodeId: node.id,
    endNodeId: endId,
    sideNodeIds: bodyIds,
    memberNodeIds: [node.id, ...bodyIds, endId],
  })
  ctx.tunnelStack.pop()
  const edges = [...seg.edges]
  if (seg.entryIds.length > 0) connectControl(edges, [node.id], seg.entryIds, `loop-body-${node.id}`)
  if (seg.exitIds.length > 0) connectControl(edges, seg.exitIds, [endId], `loop-end-${node.id}`)
  else connectControl(edges, [node.id], [endId], `loop-end-empty-${node.id}`)
  return {
    nodes: [head, endNode, ...seg.nodes],
    edges,
    entryIds: [node.id],
    exitIds: [endId],
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
  if (node.type === "ecp-end") return OUTPUT_HANDLE_ID
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

function applyLoopCrossingTypes(manifest: ExecutionManifest, nodes: ReactFlowNode[], edges: ReactFlowEdge[]): void {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  for (const edge of edges) {
    if (edge.data.kind !== "data") continue
    const target = nodesById.get(edge.target)
    if (!target || target.type !== "ecp-step") continue
    const loopsCrossed = loopsCrossedBetween(manifest, edge.target, edge.source)
    if (loopsCrossed <= 0) continue
    const data = target.data as ReactFlowStepData
    const handle = edge.targetHandle
    if (!handle) continue
    const port = data.inputs.find((p) => p.id === handle)
    if (port) port.typeLabel = typeLabelCrossingLoops(port.typeLabel, loopsCrossed)
  }
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
      if (node.type === "ecp-end") return undefined
      if (node.type === "ecp-io") return (node.data as { outputs: ReactFlowPort[] }).outputs
      return undefined
    }
    const inputLists = (node: ReactFlowNode | undefined): ReactFlowPort[] | undefined => {
      if (!node) return undefined
      if (node.type === "ecp-step") return (node.data as ReactFlowStepData).inputs
      if (node.type === "ecp-loop") return (node.data as ReactFlowLoopItemsData).inputs
      if (node.type === "ecp-if") return (node.data as ReactFlowIfData).inputs
      if (node.type === "ecp-parallel") return (node.data as ReactFlowParallelData).inputs
      if (node.type === "ecp-end") return undefined
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

function tunnelNodesForSpecs(
  laid: ReactFlowDocument,
  tunnels: readonly TunnelSpec[],
  options?: ReactFlowEncodeOptions,
  detachedStructureIds?: ReadonlySet<string>,
): ReactFlowNode[] {
  const rects = computeAllTunnelRects(laid.nodes, options)
  const out: ReactFlowNode[] = []
  for (const spec of tunnels) {
    const rect =
      rects.get(spec.tunnelId) ??
      computeTunnelRect(
        laid.nodes,
        {
          tunnelKind: spec.tunnelKind,
          controlNodeId: spec.controlNodeId,
          endNodeId: spec.endNodeId,
          sideNodeIds: spec.sideNodeIds,
          childTunnelIds: spec.childTunnelIds,
        },
        rects,
        options,
      )
    if (!rect) continue
    const data: ReactFlowTunnelData = {
      structureId: spec.structureId,
      tunnelKind: spec.tunnelKind,
      label: spec.label,
      controlNodeId: spec.controlNodeId,
      endNodeId: spec.endNodeId,
      sideNodeIds: [...spec.sideNodeIds],
      memberNodeIds: [...spec.memberNodeIds],
      childTunnelIds: [...spec.childTunnelIds],
      depth: spec.depth,
      ...(detachedStructureIds?.has(spec.structureId) ? { detached: true } : {}),
    }
    out.push({
      id: spec.tunnelId,
      type: "ecp-tunnel",
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
  const tunnels: TunnelSpec[] = []
  const ctx: EncodeContext = {
    manifest,
    capabilitySchemas: options?.capabilitySchemas,
    capabilityMeta: options?.capabilityMeta,
    tunnels,
    tunnelStack: [],
  }
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
    } else if (portKind === "ecp-loop" || portKind === "ecp-if" || portKind === "ecp-parallel") {
      const data = node.data as { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] }
      outputPortIds.set(node.id, data.outputs.map((port) => port.id))
      inputPortIds.set(node.id, data.inputs.map((port) => port.id))
    }
  }

  const acceptsKeys = acceptsPropertyKeys(manifest)
  const dataEdges = [...extractDataEdges(steps, acceptsKeys, outputPortIds, inputPortIds), ...extractReturnsEdges(manifest, [...body.nodes])]
  ensureEdgePorts(nodesById, dataEdges)
  applyLoopCrossingTypes(manifest, nodes, dataEdges)

  const layoutEdges: ReactFlowEdge[] = [...body.edges, ...dataEdges]
  if (body.entryIds.length > 0) connectControl(layoutEdges, [acceptsNode.id], body.entryIds, "io-accepts")
  else if (returnsNode) connectControl(layoutEdges, [acceptsNode.id], [returnsNode.id], "io-empty")
  if (returnsNode && body.exitIds.length > 0) connectControl(layoutEdges, body.exitIds, [returnsNode.id], "io-returns")

  const nodeHeight = options?.nodeHeight ?? 160
  const laid = treeLayoutReactFlowDocument(
    { nodes, edges: layoutEdges },
    steps,
    options,
    returnsNode
      ? { acceptsId: acceptsNode.id, returnsId: returnsNode.id }
      : { acceptsId: acceptsNode.id },
  )
  let flowNodes = laid.nodes
  const detachedRoots = Array.isArray(manifest.detached) ? manifest.detached : []
  const detachedStructureIds = new Set<string>()

  if (detachedRoots.length > 0) {
    const detachedTunnels: TunnelSpec[] = []
    const detachedCtx: EncodeContext = {
      manifest,
      capabilitySchemas: options?.capabilitySchemas,
      capabilityMeta: options?.capabilityMeta,
      tunnels: detachedTunnels,
      tunnelStack: [],
    }
    const detachedSeg = renderNodes(detachedRoots, detachedCtx)
    const controlEdges = detachedSeg.edges.filter((edge) => edge.data.kind === "control")
    const detachedLayout = treeLayoutReactFlowDocument({ nodes: detachedSeg.nodes, edges: controlEdges }, detachedRoots, options)
    const mainMaxY = documentMaxY(flowNodes, nodeHeight)
    const mainMinX = flowNodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const detachedMinY = detachedLayout.nodes.reduce((min, node) => Math.min(min, node.position.y), Infinity)
    const detachedMinX = detachedLayout.nodes.reduce((min, node) => Math.min(min, node.position.x), Infinity)
    const dy = mainMaxY + TREE_GAP_X - detachedMinY
    const dx = mainMinX - detachedMinX
    const translated = translateDocumentNodes(detachedLayout, dx, dy).nodes.map((node) => ({
      ...node,
      data: { ...node.data, detached: true },
    }))
    flowNodes = [...flowNodes, ...translated]
    tunnels.push(...detachedTunnels)
    for (const root of detachedRoots) walkDetachedIds(root, detachedStructureIds)
  }

  const tunnelNodes = tunnelNodesForSpecs({ nodes: flowNodes, edges: laid.edges }, tunnels, options, detachedStructureIds)
  return { nodes: [...tunnelNodes, ...flowNodes], edges: publishEdges(laid.edges) }
}