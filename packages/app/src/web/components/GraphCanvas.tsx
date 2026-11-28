import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { LayoutGrid, Redo2, Undo2 } from "lucide-react"
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
  appendEmptyParallelPath,
  connectInputAndAttach,
  connectInputTarget,
  dataConnectionRefusal,
  deleteConnector,
  deleteStep,
  isDataHandle,
  isStructureHeaderSelection,
  isValidDataConnection,
  placementAtFlowPoint,
  placementForConnectionOrigin,
  portOnDocument,
  removeStructure,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
  CONNECTION_EDIT_INCOMPATIBLE,
  resizeTunnelNodes,
  type AddStepPlacement,
  type PositionOverrides,
  type ReactFlowDocument,
  type ReactFlowEndData,
  type ReactFlowTunnelData,
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
import { EcpControlNode } from "./EcpControlNode.js"
import { EcpIoNode } from "./EcpIoNode.js"
import { EdgeMenuContext, type EdgeMenuContextValue } from "./edge-menu-context.js"
import { EcpEndNode } from "./EcpEndNode.js"
import { EcpTunnelNode } from "./EcpTunnelNode.js"
import { RailVisualLayer } from "./RailVisualLayer.js"
import type { EcpLoopNodeData } from "./EcpLoopNode.js"
import { EcpStepNode, type EcpStepNodeData } from "./EcpStepNode.js"
import { CanvasEditContext } from "./canvas-edit-context.js"
import type { CapabilityOriginPort } from "./CapabilityMenu.js"

const nodeTypes = {
  "ecp-step": EcpStepNode,
  "ecp-io": EcpIoNode,
  "ecp-tunnel": EcpTunnelNode,
  "ecp-loop": EcpControlNode,
  "ecp-if": EcpControlNode,
  "ecp-parallel": EcpControlNode,
  "ecp-end": EcpEndNode,
  "ecp-placeholder": () => null,
}
const edgeTypes = { "ecp-data": EcpDataEdge }
const EDGE_INTERACTION_WIDTH = 20
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.2 }

/**
 * Selected data branch on the canvas.
 * @category App
 */
export interface SelectedEdge {
  /** Published edge id. */
  edgeId: string
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
  /** Selected data branch, when any. */
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
  /** Undo the last committed edit. */
  onUndo: () => void
  /** Redo the last undone edit. */
  onRedo: () => void
  /** Undo control disabled (read-only or empty stack). */
  undoDisabled: boolean
  /** Redo control disabled. */
  redoDisabled: boolean
}

function topLevelPlacement(manifest: ExecutionManifest, selectedId: string | undefined): AddStepPlacement {
  if (!selectedId) return { kind: "top" }
  if (selectedId === EXECUTION_ACCEPTS_NODE_ID || selectedId === EXECUTION_RETURNS_NODE_ID) return { kind: "top" }
  if (!findNodePlacement(manifest.steps, selectedId)) return { kind: "top" }
  return { kind: "top", after: selectedId }
}

function findStepNode(document: ReactFlowDocument, nodeId: string): boolean {
  return document.nodes.some((node) => node.id === nodeId && node.type === "ecp-step")
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

function ifSideByStepId(document: ReactFlowDocument): Map<string, { ifId: string; side: "then" | "else" }> {
  const out = new Map<string, { ifId: string; side: "then" | "else" }>()
  for (const node of document.nodes) {
    if (node.type !== "ecp-tunnel") continue
    const tunnel = node.data as ReactFlowTunnelData
    if (tunnel.tunnelKind !== "then" && tunnel.tunnelKind !== "else") continue
    for (const memberId of tunnel.memberNodeIds) {
      out.set(memberId, { ifId: tunnel.structureId, side: tunnel.tunnelKind })
    }
  }
  return out
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
  const dataConnectable = !readOnly
  const ifSides = ifSideByStepId(document)
  const choices = run.choices
  return document.nodes.map((node) => {
    const connected = {
      connectedTargetHandles: targets.get(node.id) ?? [],
      connectedSourceHandles: sources.get(node.id) ?? [],
    }
    let data: Record<string, unknown>
    if (node.type === "ecp-step") {
      const runStep = run.steps[node.id]
      const issues = nodeErrors[node.id] ?? []
      let status = stepStatus(run, node.id)
      const side = ifSides.get(node.id)
      if (side && side.ifId in choices) {
        const choice = choices[side.ifId]
        if (choice !== null && choice !== side.side) status = "skipped"
      }
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
      step.dataConnectable = dataConnectable
      data = step as unknown as Record<string, unknown>
    } else if (node.type === "ecp-loop") {
      const loopRun = run.loopItems[node.id]
      const loopRound = run.loops[node.id]
      const loopNode: EcpLoopNodeData = {
        ...(node.data as EcpLoopNodeData),
        dataConnectable,
        ...connected,
        ...(loopRun ? { done: loopRun.done, count: loopRun.count } : {}),
        ...(loopRound ? { round: loopRound.round } : {}),
      }
      data = loopNode as unknown as Record<string, unknown>
    } else if (node.type === "ecp-if") {
      const choice = run.choices[node.id]
      data = {
        ...node.data,
        ...connected,
        dataConnectable,
        ...(choice !== undefined ? { choiceSide: choice } : {}),
      }
    } else {
      data = { ...node.data, ...connected, dataConnectable }
    }
    if (node.type === "ecp-tunnel") {
      const tunnel = node.data as ReactFlowTunnelData
      let dimmed = false
      if ((tunnel.tunnelKind === "then" || tunnel.tunnelKind === "else") && tunnel.structureId in choices) {
        const choice = choices[tunnel.structureId]
        if (choice !== null && choice !== tunnel.tunnelKind) dimmed = true
      }
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: { ...tunnel, dimmed } as unknown as Record<string, unknown>,
        zIndex: node.zIndex ?? 0,
        selectable: false,
        draggable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        className: dimmed ? "ecp-rf-tunnel--dimmed" : undefined,
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
    if (node.type === "ecp-end") {
      const endData = node.data as ReactFlowEndData
      const loopRound = run.loops[endData.structureId]
      let endDimmed = false
      if (
        endData.structureKind === "if" &&
        (endData.side === "then" || endData.side === "else") &&
        endData.structureId in choices
      ) {
        const choice = choices[endData.structureId]
        if (choice !== null && choice !== endData.side) endDimmed = true
      }
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          ...endData,
          ...(loopRound ? { round: loopRound.round } : {}),
          dimmed: endDimmed,
        } as unknown as Record<string, unknown>,
        zIndex: 1000,
        selectable: false,
        draggable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        className: endDimmed ? "ecp-rf-node--dimmed" : undefined,
        ...(node.style?.width !== undefined
          ? { style: { width: node.style.width, height: node.style?.height } }
          : {}),
      }
    }
    const tunnelSide = ifSides.get(node.id)
    const nodeDimmed =
      tunnelSide &&
      tunnelSide.ifId in choices &&
      choices[tunnelSide.ifId] !== null &&
      choices[tunnelSide.ifId] !== tunnelSide.side
    const stepSelected = node.type === "ecp-step" && selectedStepIds.includes(node.id)
    const structureSelected =
      selectedId === node.id &&
      (node.type === "ecp-loop" || node.type === "ecp-if" || node.type === "ecp-parallel")
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data,
      selected: stepSelected || structureSelected || (node.type === "ecp-io" && selectedId === node.id),
      zIndex: 1000,
      connectable: dataConnectable,
      deletable: false,
      className: nodeDimmed ? "ecp-rf-node--dimmed" : undefined,
      ...(node.style?.width !== undefined ? { style: { width: node.style.width } } : {}),
    }
  })
}

function buildEdges(document: ReactFlowDocument, _run: RunGraphState, selectedEdge?: SelectedEdge): Edge[] {
  const edges: Edge[] = []
  for (const edge of document.edges) {
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

/** Re-fit tunnels after nodes move so member bounds stay wrapped. */
function applyTunnelBoundsToNodes(nodes: Node[]): Node[] {
  return resizeTunnelNodes(nodes as unknown as ReactFlowNode[]) as unknown as Node[]
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
  onUndo,
  onRedo,
  undoDisabled,
  redoDisabled,
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
      return dragging.size > 0 ? applyTunnelBoundsToNodes(merged) : merged
    })
  }, [built])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const kept = changes.filter((change) => change.type === "dimensions" || change.type === "position")
    if (kept.length === 0) return
    setNodes((current) => {
      const next = applyNodeChanges(kept, current)
      if (kept.some((change) => change.type === "position")) return applyTunnelBoundsToNodes(next)
      return next
    })
  }, [])

  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: Node, dragged: Node[]) => {
      const updates: PositionOverrides = {}
      for (const node of dragged) {
        if (node.type === "ecp-tunnel" || node.type === "ecp-end") continue
        updates[node.id] = { x: node.position.x, y: node.position.y }
      }
      if (Object.keys(updates).length > 0) onPositionDragStop(updates)
    },
    [onPositionDragStop],
  )

  const closeMenu = useCallback(() => setMenu(undefined), [])

  const edgeMenu = useMemo<EdgeMenuContextValue>(
    () => ({
      hoveredEdgeId,
      selectedEdgeId: selectedEdge?.edgeId,
      openMenu: (edgeId, clientX, clientY) => {
        setMenu({ kind: "edge", edgeId, clientX, clientY })
      },
    }),
    [hoveredEdgeId, selectedEdge?.edgeId],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const target = connectInputTarget(connection)
      if (!target) return
      void applyEdit((current) => connectInputAndAttach(current, target))
    },
    [applyEdit],
  )

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (readOnly) return false
      const c = connection as Connection
      if (!c.source || !c.target) return false
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
    <EdgeMenuContext.Provider value={edgeMenu}>
    <FlowProjectionRefContext.Provider value={screenToFlowRef}>
    <CanvasEditContext.Provider value={canvasEdit}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onMove={(event) => {
        // Only a pan / zoom the user makes closes menus; programmatic moves (fit view after a load or an edit) have no
        // event and must not close a menu the user just opened.
        if (!event) return
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
        if (node.type === "ecp-loop" || node.type === "ecp-if" || node.type === "ecp-parallel" || node.type === "ecp-io") {
          onSelect(node.id)
        }
      }}
      onNodeContextMenu={(event, node) => {
        if (node.type === "ecp-end") {
          event.preventDefault()
          return
        }
        if (node.type === "ecp-io") {
          openCanvasContextMenu({ kind: "io" }, event)
          return
        }
        if (openCanvasContextMenu({ kind: "node", nodeId: node.id }, event) === "node") {
          setMenu({ kind: "node", nodeId: node.id, clientX: event.clientX, clientY: event.clientY })
        }
      }}
      onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
      onEdgeMouseLeave={() => setHoveredEdgeId(undefined)}
      onEdgeContextMenu={(event, edge) => {
        if (openCanvasContextMenu({ kind: "edge" }, event) === "edge") {
          setMenu({
            kind: "edge",
            edgeId: edge.id,
            clientX: event.clientX,
            clientY: event.clientY,
          })
        }
      }}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onPaneContextMenu={(event) => {
        openCanvasContextMenu({ kind: "pane" }, event)
        const project = screenToFlowRef.current
        if (!project || readOnly || !onOpenCapabilityMenu) return
        const flow = project({ x: event.clientX, y: event.clientY })
        const placement = placementAtFlowPoint(manifest, document, flow) ?? topLevelPlacement(manifest, selectedId)
        onOpenCapabilityMenu(event.clientX, event.clientY, placement, undefined, undefined, flow)
      }}
      onEdgeClick={(_, edge) => {
        onSelect(undefined)
        onSelectSteps([])
        onSelectEdge({ edgeId: edge.id })
      }}
      onPaneClick={() => {
        onSelect(undefined)
        onSelectSteps([])
        onSelectEdge(undefined)
        closeMenu()
        onMenuDismiss?.()
      }}
      deleteKeyCode={null}
      nodesDraggable
      nodesConnectable={!readOnly}
      elementsSelectable
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-surface-container-highest)" />
      <RailVisualLayer
        manifest={manifest}
        nodes={nodes as unknown as ReactFlowNode[]}
        run={run}
      />
      <Controls showInteractive={false}>
        <ControlButton
          onClick={onUndo}
          disabled={undoDisabled}
          title="Undo"
          data-testid="canvas-undo"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </ControlButton>
        <ControlButton
          onClick={onRedo}
          disabled={redoDisabled}
          title="Redo"
          data-testid="canvas-redo"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </ControlButton>
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
            onSelectEdge(undefined)
            onSelectSteps(findStepNode(document, menu.nodeId) ? [menu.nodeId] : [])
            onSelect(menu.nodeId)
          } else {
            onSelect(undefined)
            onSelectSteps([])
            onSelectEdge({ edgeId: menu.edgeId })
          }
          closeMenu()
        }}
        onDeleteConnector={() => {
          if (menu.kind !== "edge") return
          const edge = document.edges.find((entry) => entry.id === menu.edgeId)
          if (!edge) return
          void applyEdit((current) => deleteConnector(current, edge)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onWrap={(kind) => {
          if (menu.kind !== "node") return
          const ids = wrapSelectionIds(selectedStepIds, menu.nodeId)
          void applyEdit((current) => wrapSteps(current, ids, kind)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onDelete={() => {
          if (menu.kind !== "node") return
          const nodeId = menu.nodeId
          void applyEdit((current) =>
            isStructureHeaderSelection(current, nodeId) ? unwrapStructure(current, nodeId) : deleteStep(current, nodeId),
          ).then((ok) => {
            if (ok) closeMenu()
          })
        }}
        onDeleteWithNodes={() => {
          if (menu.kind !== "node") return
          const nodeId = menu.nodeId
          void applyEdit((current) => removeStructure(current, nodeId)).then((ok) => {
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
        onAppendEmptyPath={(parallelId) => {
          void applyEdit((current) => appendEmptyParallelPath(current, parallelId)).then((ok) => {
            if (ok) closeMenu()
          })
        }}
      />
    ) : null}
    </EdgeMenuContext.Provider>
  )
}
