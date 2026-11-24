import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { LayoutGrid } from "lucide-react"
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type Connection,
  type NodeChange,
  type FinalConnectionState,
} from "@xyflow/react"
import type { ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import {
  armRunState,
  attachAfter,
  attachAsArm,
  attachAsLine,
  connectInput,
  connectInputTarget,
  dataConnectionRefusal,
  deleteConnector,
  deleteStep,
  isDataHandle,
  isValidDataConnection,
  isValidManifestFlowConnection,
  placementForConnectionOrigin,
  portOnDocument,
  removeStructure,
  resolveFlowConnect,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
  CONNECTION_EDIT_INCOMPATIBLE,
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  frameBounds,
  type AddStepPlacement,
  type FrameMembership,
  type PositionOverrides,
  type ReactFlowDocument,
  type ReactFlowFrameData,
  type ReactFlowNode,
  type ReactFlowPort,
  type ReactFlowStepData,
  type ReactFlowStepStatus,
  type StructureEditResult,
  type RunGraphState,
} from "../../graph/index.js"
import { EXECUTION_ACCEPTS_NODE_ID, EXECUTION_RETURNS_NODE_ID } from "../../graph/io-from-schema.js"
import { findNodePlacement } from "../../graph/manifest-walk.js"
import { openCanvasContextMenu } from "../lib/canvas-context-menu.js"
import { CanvasMenu, type CanvasMenuState } from "./CanvasMenu.js"
import { EcpDataEdge } from "./EcpDataEdge.js"
import { EcpFrameNode } from "./EcpFrameNode.js"
import { EcpIoNode } from "./EcpIoNode.js"
import { EcpRouteEdge } from "./EcpRouteEdge.js"
import { EdgeMenuContext, type EdgeMenuContextValue } from "./edge-menu-context.js"
import { FrameActionsContext, type FrameActionsContextValue } from "./frame-actions-context.js"
import { RouteEdgeSelectionContext, type RouteEdgeSelectionContextValue } from "./route-edge-selection-context.js"
import { EcpLoopNode, type EcpLoopNodeData } from "./EcpLoopNode.js"
import { EcpStepNode, type EcpStepNodeData } from "./EcpStepNode.js"
import { CanvasEditContext } from "./canvas-edit-context.js"
import type { CapabilityOriginPort } from "./CapabilityMenu.js"

const nodeTypes = {
  "ecp-step": EcpStepNode,
  "ecp-io": EcpIoNode,
  "ecp-frame": EcpFrameNode,
  "ecp-loop": EcpLoopNode,
}
const edgeTypes = { "ecp-data": EcpDataEdge, "ecp-route": EcpRouteEdge }
const EDGE_INTERACTION_WIDTH = 20
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.2 }

/**
 * Selected edge on the canvas, including the route level for stacked pills.
 * @category App
 */
export interface SelectedEdge {
  /** Published edge id. */
  edgeId: string
  /** Index into `levels` on a route edge (`0` for data edges and path clicks). */
  level: number
}

/**
 * Request to bring a node into view. `nonce` changes on every request.
 * @category App
 */
export interface FocusRequest {
  /** Node id. */
  id: string
  /** Changes per request so the same node can be focused twice. */
  nonce: number
}

/**
 * Props for {@link GraphCanvas}.
 * @category App
 */
export interface GraphCanvasProps {
  /** Encoded, laid-out execution (with position overrides applied). */
  document: ReactFlowDocument
  /** Fit key from the pre-override dagre document. */
  layoutKey: string
  /** Open execution manifest (for menus). */
  manifest: ExecutionManifest
  /** Run statuses to overlay (live or replayed). */
  run: RunGraphState
  /** Node id to its error-severity validation issues. */
  nodeErrors: Record<string, ValidationIssue[]>
  /** Selected node or structure id. */
  selectedId?: string
  /** Multi-selected step ids (Shift / modifier click). */
  selectedStepIds: readonly string[]
  /** True while a run is busy or a replay is selected. */
  readOnly: boolean
  /** Selected edge and route level, when any. */
  selectedEdge?: SelectedEdge
  /** Called with the clicked node id, or undefined when the pane is clicked. */
  onSelect: (id: string | undefined) => void
  /** Update step multi-selection. */
  onSelectSteps: (ids: string[]) => void
  /** Called with the clicked edge, or undefined when the pane is clicked. */
  onSelectEdge: (selection: SelectedEdge | undefined) => void
  /** Persist a manifest edit (save path). */
  applyEdit: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  /** Bring this node into view. */
  focus?: FocusRequest
  /** Close the context menu when the canvas pans or zooms. */
  onMenuDismiss?: () => void
  /** Open the capability picker (phase 4+). */
  onOpenCapabilityMenu?: (
    clientX: number,
    clientY: number,
    placement: AddStepPlacement,
    origin?: CapabilityOriginPort,
    originPort?: ReactFlowPort,
    flowPosition?: { x: number; y: number },
  ) => void
  /** Persist drag stop positions to browser storage. */
  onPositionDragStop: (updates: PositionOverrides) => void
  /** Clear overrides and storage for this execution. */
  onAutoLayout: () => void
  /** Skip the next layout-driven fit (cursor-placed step). */
  suppressNextFitRef?: MutableRefObject<boolean>
}

function topLevelPlacement(manifest: ExecutionManifest, selectedId: string | undefined): AddStepPlacement {
  if (!selectedId) return { kind: "top" }
  if (selectedId === EXECUTION_ACCEPTS_NODE_ID || selectedId === EXECUTION_RETURNS_NODE_ID) return { kind: "top" }
  if (!findNodePlacement(manifest.steps, selectedId)) return { kind: "top" }
  return { kind: "top", after: selectedId }
}

function stepStatus(run: RunGraphState, id: string): ReactFlowStepStatus | undefined {
  const step = run.steps[id]
  if (step) return step.status
  return run.status === "running" ? "pending" : undefined
}

function connectedHandles(document: ReactFlowDocument): {
  targets: Map<string, string[]>
  sources: Map<string, string[]>
} {
  const targets = new Map<string, string[]>()
  const sources = new Map<string, string[]>()
  for (const edge of document.edges) {
    if (edge.data.kind !== "data") continue
    if (edge.targetHandle) targets.set(edge.target, [...(targets.get(edge.target) ?? []), edge.targetHandle])
    if (edge.sourceHandle) sources.set(edge.source, [...(sources.get(edge.source) ?? []), edge.sourceHandle])
  }
  return { targets, sources }
}

function structureIdFromSelection(
  document: ReactFlowDocument,
  selectedId: string | undefined,
): string | undefined {
  if (!selectedId) return undefined
  const frame = document.nodes.find(
    (node) => node.type === "ecp-frame" && (node.data as ReactFlowFrameData).structureId === selectedId,
  )
  if (frame) return selectedId
  const loop = document.nodes.find((node) => node.type === "ecp-loop" && node.id === selectedId)
  if (loop) return selectedId
  return undefined
}

function frameAtFlowPoint(document: ReactFlowDocument, point: { x: number; y: number }): ReactFlowNode | undefined {
  const hit = document.nodes
    .filter((node) => node.type === "ecp-frame")
    .filter((frame) => {
      const w = frame.style?.width ?? 0
      const h = frame.style?.height ?? 0
      return (
        point.x >= frame.position.x &&
        point.y >= frame.position.y &&
        point.x <= frame.position.x + w &&
        point.y <= frame.position.y + h
      )
    })
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
  return hit[0]
}

function buildNodes(
  document: ReactFlowDocument,
  run: RunGraphState,
  nodeErrors: Record<string, ValidationIssue[]>,
  selectedId: string | undefined,
  selectedStepIds: readonly string[],
  readOnly: boolean,
): Node[] {
  const { targets, sources } = connectedHandles(document)
  const flowConnectable = !readOnly
  const dataConnectable = !readOnly
  return document.nodes.map((node) => {
    const connected = {
      connectedTargetHandles: targets.get(node.id) ?? [],
      connectedSourceHandles: sources.get(node.id) ?? [],
    }
    let data: Record<string, unknown>
    if (node.type === "ecp-step") {
      const runStep = run.steps[node.id]
      const issues = nodeErrors[node.id] ?? []
      const status = stepStatus(run, node.id)
      const stepData = node.data as ReactFlowStepData
      const step: EcpStepNodeData = {
        ...stepData,
        ...connected,
        ...(status ? { status } : {}),
        ...(runStep?.round !== undefined ? { round: runStep.round } : {}),
        ...(runStep?.item !== undefined ? { item: runStep.item } : {}),
        ...(issues.length > 0 ? { invalid: true } : {}),
      }
      const message = runStep?.status === "failed" ? runStep.message : issues[0]?.message
      if (message) step.errorMessage = message
      step.flowConnectable = flowConnectable
      step.dataConnectable = dataConnectable
      data = step as unknown as Record<string, unknown>
    } else if (node.type === "ecp-loop") {
      const loopRun = run.loopItems[node.id]
      const loopRound = run.loops[node.id]
      const loopNode: EcpLoopNodeData = {
        ...(node.data as EcpLoopNodeData),
        flowConnectable,
        dataConnectable,
        ...connected,
        ...(loopRun ? { done: loopRun.done, count: loopRun.count } : {}),
        ...(loopRound ? { round: loopRound.round } : {}),
      }
      data = loopNode as unknown as Record<string, unknown>
    } else {
      data = { ...node.data, ...connected, flowConnectable, dataConnectable }
    }
    if (node.type === "ecp-frame") {
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: { ...(node.data as ReactFlowFrameData), flowConnectable } as unknown as Record<string, unknown>,
        zIndex: node.zIndex ?? 0,
        selectable: false,
        draggable: false,
        connectable: flowConnectable,
        deletable: false,
        focusable: false,
        ...(node.style?.width !== undefined
          ? {
              style: {
                width: node.style.width,
                height: node.style?.height,
                pointerEvents: "none",
              },
            }
          : {}),
      }
    }
    const stepSelected = node.type === "ecp-step" && selectedStepIds.includes(node.id)
    const loopSelected = node.type === "ecp-loop" && selectedId === node.id
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data,
      selected: stepSelected || loopSelected || (node.type === "ecp-io" && selectedId === node.id),
      zIndex: 1000,
      connectable: flowConnectable,
      deletable: false,
      ...(node.style?.width !== undefined ? { style: { width: node.style.width } } : {}),
    }
  })
}

function buildEdges(document: ReactFlowDocument, run: RunGraphState, selectedEdge?: SelectedEdge): Edge[] {
  const edges: Edge[] = []
  for (const edge of document.edges) {
    if (edge.data.kind === "route") {
      const armState = armRunState(edge.data, run)
      const stateClass = armState === "idle" ? "" : ` ecp-rf-edge--${armState}`
      const selected = edge.id === selectedEdge?.edgeId
      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: "ecp-route",
        data: { ...edge.data, armState },
        className: `ecp-rf-edge--route${stateClass}${selected ? " ecp-rf-edge--selected" : ""}`,
        interactionWidth: EDGE_INTERACTION_WIDTH,
        selectable: true,
        selected,
      })
      continue
    }
    if (edge.data.kind !== "data" || !edge.sourceHandle || !edge.targetHandle) continue
    const selected = edge.id === selectedEdge?.edgeId
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "ecp-data",
      data: { ...edge.data },
      className: `ecp-rf-edge--data${selected ? " ecp-rf-edge--selected" : ""}`,
      interactionWidth: EDGE_INTERACTION_WIDTH,
      selectable: true,
      selected,
    })
  }
  return edges
}

function FocusNode({ focus }: { focus?: FocusRequest }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!focus) return
    const frame = requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: focus.id }], duration: 200, padding: 0.6, maxZoom: 1.2 })
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, focus])
  return null
}

function frameMembershipFromNodes(nodes: readonly Node[]): FrameMembership[] {
  const out: FrameMembership[] = []
  for (const node of nodes) {
    if (node.type !== "ecp-frame") continue
    const data = node.data as unknown as ReactFlowFrameData
    out.push({
      frameId: node.id,
      memberNodeIds: data.memberNodeIds,
      childFrameIds: data.childFrameIds,
      depth: data.depth,
    })
  }
  return out
}

function applyFrameBoundsToNodes(nodes: Node[]): Node[] {
  const rects = frameBounds(nodes, frameMembershipFromNodes(nodes))
  return nodes.map((node) => {
    if (node.type !== "ecp-frame") return node
    const rect = rects.get(node.id)
    if (!rect) return node
    return {
      ...node,
      position: { x: rect.x, y: rect.y },
      style: {
        ...(node.style ?? {}),
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      },
    }
  })
}

function CaptureFlowProjection() {
  const { screenToFlowPosition } = useReactFlow()
  const holder = useContext(FlowProjectionRefContext)
  useEffect(() => {
    if (holder) holder.current = screenToFlowPosition
  }, [holder, screenToFlowPosition])
  return null
}

const FlowProjectionRefContext = createContext<
  React.MutableRefObject<((position: { x: number; y: number }) => { x: number; y: number }) | undefined> | undefined
>(undefined)

function FitGraphOnLayout({
  layoutKey,
  suppressNextFitRef,
}: {
  layoutKey: string
  suppressNextFitRef?: MutableRefObject<boolean>
}) {
  const { fitView } = useReactFlow()
  const lastKey = useRef<string | undefined>(undefined)
  const initialMount = useRef(true)
  useEffect(() => {
    if (layoutKey === lastKey.current) return
    const first = initialMount.current
    initialMount.current = false
    lastKey.current = layoutKey
    if (!first && suppressNextFitRef?.current) {
      suppressNextFitRef.current = false
      return
    }
    const frame = requestAnimationFrame(() => {
      void fitView(FIT_VIEW_OPTIONS)
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, layoutKey, suppressNextFitRef])

  useEffect(() => {
    const onResize = (): void => {
      requestAnimationFrame(() => {
        void fitView(FIT_VIEW_OPTIONS)
      })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [fitView])

  return null
}

/**
 * View-only React Flow canvas of an execution with run and validation overlays. Reloads
 * keep the viewport; measured node sizes carry over while node ids persist.
 * @category App
 */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasBody {...props} />
    </ReactFlowProvider>
  )
}

function AutoLayoutControl({ onAutoLayout }: { onAutoLayout: () => void }) {
  const { fitView } = useReactFlow()
  return (
    <ControlButton
      onClick={() => {
        onAutoLayout()
        void fitView(FIT_VIEW_OPTIONS)
      }}
      title="Auto layout"
      data-testid="canvas-auto-layout"
      aria-label="Auto layout"
    >
      <LayoutGrid className="h-4 w-4" aria-hidden="true" />
    </ControlButton>
  )
}

function GraphCanvasBody({
  document,
  layoutKey,
  manifest,
  run,
  nodeErrors,
  selectedId,
  selectedStepIds,
  readOnly,
  selectedEdge,
  onSelect,
  onSelectSteps,
  onSelectEdge,
  applyEdit,
  focus,
  onOpenCapabilityMenu,
  onMenuDismiss,
  onPositionDragStop,
  onAutoLayout,
  suppressNextFitRef,
}: GraphCanvasProps) {
  const built = useMemo(
    () => buildNodes(document, run, nodeErrors, selectedId, selectedStepIds, readOnly),
    [document, run, nodeErrors, selectedId, selectedStepIds, readOnly],
  )
  const edges = useMemo(() => buildEdges(document, run, selectedEdge), [document, run, selectedEdge])
  const [menu, setMenu] = useState<CanvasMenuState | undefined>(undefined)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | undefined>(undefined)
  const screenToFlowRef = useRef<
    ((position: { x: number; y: number }) => { x: number; y: number }) | undefined
  >(undefined)
  const selectedStructureId = useMemo(() => structureIdFromSelection(document, selectedId), [document, selectedId])
  const routeSelection = useMemo<RouteEdgeSelectionContextValue>(
    () => ({
      selectedEdgeId: selectedEdge?.edgeId,
      selectedLevel: selectedEdge?.level,
      select: (edgeId, level) => {
        onSelect(undefined)
        onSelectEdge({ edgeId, level })
      },
    }),
    [onSelect, onSelectEdge, selectedEdge?.edgeId, selectedEdge?.level],
  )
  const [nodes, setNodes] = useState<Node[]>(built)

  useEffect(() => {
    setNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node.measured]))
      const dragging = new Map(
        previous.filter((node) => node.dragging === true).map((node) => [node.id, node.position] as const),
      )
      const merged = built.map((node) => {
        const size = measured.get(node.id)
        const dragPos = dragging.get(node.id)
        let next = size ? { ...node, measured: size } : node
        if (dragPos) next = { ...next, position: dragPos, dragging: true }
        return next
      })
      return dragging.size > 0 ? applyFrameBoundsToNodes(merged) : merged
    })
  }, [built])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const kept = changes.filter((change) => change.type === "dimensions" || change.type === "position")
    if (kept.length === 0) return
    setNodes((current) => {
      const next = applyNodeChanges(kept, current)
      if (kept.some((change) => change.type === "position")) return applyFrameBoundsToNodes(next)
      return next
    })
  }, [])

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: Node, dragged: Node[]) => {
      const updates: PositionOverrides = {}
      for (const node of dragged) {
        if (node.type === "ecp-frame") continue
        updates[node.id] = { x: node.position.x, y: node.position.y }
      }
      if (Object.keys(updates).length > 0) onPositionDragStop(updates)
    },
    [onPositionDragStop],
  )

  const closeMenu = useCallback(() => setMenu(undefined), [])

  const frameActions = useMemo<FrameActionsContextValue>(
    () => ({
      selectedStructureId,
      onHeaderClick: (structureId) => {
        onSelectEdge(undefined)
        onSelectSteps([])
        onSelect(structureId)
      },
      onOpenMenu: (structureId, clientX, clientY) => {
        setMenu({ kind: "container", structureId, clientX, clientY })
      },
    }),
    [onSelect, onSelectEdge, onSelectSteps, selectedStructureId],
  )

  const openContainerMenu = useCallback(
    (structureId: string, clientX: number, clientY: number) => {
      openCanvasContextMenu({ kind: "frame", structureId }, { preventDefault: () => {} })
      setMenu({ kind: "container", structureId, clientX, clientY })
    },
    [],
  )

  const edgeMenu = useMemo<EdgeMenuContextValue>(
    () => ({
      hoveredEdgeId,
      selectedEdgeId: selectedEdge?.edgeId,
      selectedLevel: selectedEdge?.level,
      openMenu: (edgeId, level, clientX, clientY) => {
        setMenu({ kind: "edge", edgeId, level, clientX, clientY })
      },
    }),
    [hoveredEdgeId, selectedEdge?.edgeId, selectedEdge?.level],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const action = resolveFlowConnect(manifest, document, connection)
      if (action) {
        void applyEdit((current) => {
          if (action.kind === "attachAfter") return attachAfter(current, action.sourceId, action.detachedId)
          if (action.kind === "attachAsArm") return attachAsArm(current, action.branchId, action.detachedId)
          return attachAsLine(current, action.parallelId, action.detachedId)
        })
        return
      }
      const target = connectInputTarget(connection)
      if (!target) return
      void applyEdit((current) => connectInput(current, target))
    },
    [applyEdit, document, manifest],
  )

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (readOnly) return false
      const c = connection as Connection
      if (!c.source || !c.target) return false
      if (c.sourceHandle === FLOW_OUT_HANDLE && c.targetHandle === FLOW_IN_HANDLE) {
        return isValidManifestFlowConnection(manifest, document, c)
      }
      return isValidDataConnection(manifest, document, c)
    },
    [document, manifest, readOnly],
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (readOnly) return
      if (state.isValid === true) return
      const fromHandle = state.fromHandle
      const fromNode = state.fromNode
      if (!fromHandle || !fromNode) return
      if (!isDataHandle(fromHandle.id)) return

      if (state.toNode != null && state.isValid === false) {
        const reason =
          dataConnectionRefusal(manifest, document, {
            source: fromHandle.type === "source" ? fromNode.id : state.toNode.id,
            target: fromHandle.type === "source" ? state.toNode.id : fromNode.id,
            sourceHandle: fromHandle.type === "source" ? (fromHandle.id ?? "") : (state.toHandle?.id ?? ""),
            targetHandle: fromHandle.type === "source" ? (state.toHandle?.id ?? "") : (fromHandle.id ?? ""),
          }) ?? CONNECTION_EDIT_INCOMPATIBLE
        void applyEdit(() => ({ ok: false, reason }))
        return
      }

      if (state.toNode == null && onOpenCapabilityMenu) {
        const clientX = "clientX" in event ? event.clientX : event.changedTouches[0]?.clientX ?? 0
        const clientY = "clientY" in event ? event.clientY : event.changedTouches[0]?.clientY ?? 0
        const side = fromHandle.type === "source" ? "output" : "input"
        const origin: CapabilityOriginPort = { nodeId: fromNode.id, handleId: fromHandle.id ?? "", side }
        const placement = placementForConnectionOrigin(manifest, origin)
        const originPort =
          portOnDocument(
            document,
            fromNode.id,
            fromHandle.id ?? "",
            side === "output" ? "output" : "input",
          ) ?? ({ id: fromHandle.id ?? "", name: fromHandle.id ?? "", typeLabel: "unknown" } satisfies ReactFlowPort)
        const project = screenToFlowRef.current
        const flowPosition = project ? project({ x: clientX, y: clientY }) : undefined
        onOpenCapabilityMenu(clientX, clientY, placement, origin, originPort, flowPosition)
      }
    },
    [applyEdit, document, manifest, onOpenCapabilityMenu, readOnly],
  )

  const canvasEdit = useMemo(() => ({ manifest, document }), [document, manifest])

  return (
    <FrameActionsContext.Provider value={frameActions}>
    <EdgeMenuContext.Provider value={edgeMenu}>
    <RouteEdgeSelectionContext.Provider value={routeSelection}>
    <FlowProjectionRefContext.Provider value={screenToFlowRef}>
    <CanvasEditContext.Provider value={canvasEdit}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onMove={() => {
        closeMenu()
        onMenuDismiss?.()
      }}
      onNodeClick={(event, node) => {
        onSelectEdge(undefined)
        if (node.type === "ecp-step") {
          const additive = event.shiftKey || event.metaKey || event.ctrlKey
          if (additive) {
            if (!selectedStepIds.includes(node.id)) onSelectSteps([...selectedStepIds, node.id])
            onSelect(node.id)
          } else {
            onSelectSteps([node.id])
            onSelect(node.id)
          }
          return
        }
        onSelectSteps([])
        if (node.type === "ecp-loop") onSelect(node.id)
        else if (node.type === "ecp-io") onSelect(node.id)
      }}
      onNodeContextMenu={(event, node) => {
        if (node.type === "ecp-step") {
          if (openCanvasContextMenu({ kind: "step", stepId: node.id }, event) === "node") {
            setMenu({ kind: "node", stepId: node.id, clientX: event.clientX, clientY: event.clientY })
          }
          return
        }
        if (node.type === "ecp-loop") {
          if (openCanvasContextMenu({ kind: "loop", structureId: node.id }, event) === "container") {
            setMenu({ kind: "container", structureId: node.id, clientX: event.clientX, clientY: event.clientY })
          }
          return
        }
        if (node.type === "ecp-io") openCanvasContextMenu({ kind: "io" }, event)
      }}
      onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
      onEdgeMouseLeave={() => setHoveredEdgeId(undefined)}
      onEdgeContextMenu={(event, edge) => {
        if (openCanvasContextMenu({ kind: "edge" }, event) === "edge") {
          setMenu({ kind: "edge", edgeId: edge.id, level: selectedEdge?.edgeId === edge.id ? (selectedEdge?.level ?? 0) : 0, clientX: event.clientX, clientY: event.clientY })
        }
      }}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onPaneContextMenu={(event) => {
        openCanvasContextMenu({ kind: "pane" }, event)
        const project = screenToFlowRef.current
        if (!project) return
        const flow = project({ x: event.clientX, y: event.clientY })
        const frame = frameAtFlowPoint(document, flow)
        if (frame) {
          const structureId = (frame.data as ReactFlowFrameData).structureId
          openContainerMenu(structureId, event.clientX, event.clientY)
          return
        }
        if (readOnly || !onOpenCapabilityMenu) return
        onOpenCapabilityMenu(event.clientX, event.clientY, topLevelPlacement(manifest, selectedId), undefined, undefined, flow)
      }}
      onEdgeClick={(_, edge) => {
        onSelect(undefined)
        onSelectSteps([])
        onSelectEdge({ edgeId: edge.id, level: 0 })
      }}
      onPaneClick={() => {
        onSelect(undefined)
        onSelectSteps([])
        onSelectEdge(undefined)
        closeMenu()
        onMenuDismiss?.()
      }}
      nodesDraggable
      nodesConnectable={!readOnly}
      elementsSelectable
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-surface-container-highest)" />
      <Controls showInteractive={false}>
        <AutoLayoutControl onAutoLayout={onAutoLayout} />
      </Controls>
      <FocusNode focus={focus} />
      <FitGraphOnLayout layoutKey={layoutKey} suppressNextFitRef={suppressNextFitRef} />
      <CaptureFlowProjection />
    </ReactFlow>
    </CanvasEditContext.Provider>
    </FlowProjectionRefContext.Provider>
    {menu ? (
      <CanvasMenu
        state={menu}
        readOnly={readOnly}
        manifest={manifest}
        edges={document.edges}
        selectedStepIds={selectedStepIds}
        onClose={closeMenu}
        onConfigure={() => {
          if (menu.kind === "node") {
            onSelectSteps([])
            onSelect(menu.stepId)
          } else if (menu.kind === "edge") {
            onSelect(undefined)
            onSelectSteps([])
            onSelectEdge({ edgeId: menu.edgeId, level: menu.level })
          } else {
            onSelectSteps([])
            onSelect(menu.structureId)
          }
          closeMenu()
        }}
        onDeleteConnector={() => {
          if (menu.kind !== "edge") return
          const edge = document.edges.find((entry) => entry.id === menu.edgeId)
          if (!edge) return
          void applyEdit((current) => deleteConnector(current, edge, menu.level)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onWrap={(kind) => {
          if (menu.kind !== "node") return
          const ids = wrapSelectionIds(selectedStepIds, menu.stepId)
          void applyEdit((current) => wrapSteps(current, ids, kind)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onDeleteStep={() => {
          if (menu.kind !== "node") return
          void applyEdit((current) => deleteStep(current, menu.stepId)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onUnwrap={() => {
          if (menu.kind !== "container") return
          void applyEdit((current) => unwrapStructure(current, menu.structureId)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onRemoveStructure={() => {
          if (menu.kind !== "container") return
          void applyEdit((current) => removeStructure(current, menu.structureId)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onOpenCapabilityMenu={
          onOpenCapabilityMenu
            ? (clientX, clientY, placement) => {
                closeMenu()
                onOpenCapabilityMenu(clientX, clientY, placement)
              }
            : undefined
        }
      />
    ) : null}
    </RouteEdgeSelectionContext.Provider>
    </EdgeMenuContext.Provider>
    </FrameActionsContext.Provider>
  )
}
