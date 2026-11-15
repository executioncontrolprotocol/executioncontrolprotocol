import { useCallback, useEffect, useMemo, useState } from "react"
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import type { ValidationIssue } from "@executioncontrolprotocol/protocol"
import {
  armRunState,
  type ReactFlowDocument,
  type ReactFlowStepData,
  type ReactFlowStepStatus,
  type RunGraphState,
} from "../../graph/index.js"
import { EcpDataEdge } from "./EcpDataEdge.js"
import { EcpIoNode } from "./EcpIoNode.js"
import { EcpRouteEdge } from "./EcpRouteEdge.js"
import { EcpStepNode, type EcpStepNodeData } from "./EcpStepNode.js"

const nodeTypes = { "ecp-step": EcpStepNode, "ecp-io": EcpIoNode }
const edgeTypes = { "ecp-data": EcpDataEdge, "ecp-route": EcpRouteEdge }
const EDGE_INTERACTION_WIDTH = 20
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.2 }

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
  /** Encoded, laid-out execution. */
  document: ReactFlowDocument
  /** Run statuses to overlay (live or replayed). */
  run: RunGraphState
  /** Node id to its error-severity validation issues. */
  nodeErrors: Record<string, ValidationIssue[]>
  /** Selected node id. */
  selectedId?: string
  /** Called with the clicked node id, or undefined when the pane is clicked. */
  onSelect: (id: string | undefined) => void
  /** Bring this node into view. */
  focus?: FocusRequest
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

function buildNodes(
  document: ReactFlowDocument,
  run: RunGraphState,
  nodeErrors: Record<string, ValidationIssue[]>,
  selectedId: string | undefined,
): Node[] {
  const { targets, sources } = connectedHandles(document)
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
      const step: EcpStepNodeData = {
        ...(node.data as ReactFlowStepData),
        ...connected,
        ...(status ? { status } : {}),
        ...(runStep?.round !== undefined ? { round: runStep.round } : {}),
        ...(issues.length > 0 ? { invalid: true } : {}),
      }
      const message = runStep?.status === "failed" ? runStep.message : issues[0]?.message
      if (message) step.errorMessage = message
      data = step as unknown as Record<string, unknown>
    } else {
      data = { ...node.data, ...connected }
    }
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data,
      selected: node.id === selectedId,
      draggable: false,
      connectable: false,
      deletable: false,
      ...(node.style?.width !== undefined ? { style: { width: node.style.width } } : {}),
    }
  })
}

function buildEdges(document: ReactFlowDocument, run: RunGraphState): Edge[] {
  const edges: Edge[] = []
  for (const edge of document.edges) {
    if (edge.data.kind === "route") {
      const armState = armRunState(edge.data, run)
      const stateClass = armState === "idle" ? "" : ` ecp-rf-edge--${armState}`
      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "ecp-route",
        data: { ...edge.data, armState },
        className: `ecp-rf-edge--route${stateClass}`,
        interactionWidth: EDGE_INTERACTION_WIDTH,
        selectable: false,
      })
      continue
    }
    if (edge.data.kind !== "data" || !edge.sourceHandle || !edge.targetHandle) continue
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "ecp-data",
      data: { ...edge.data },
      className: "ecp-rf-edge--data",
      interactionWidth: EDGE_INTERACTION_WIDTH,
      selectable: false,
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

/**
 * View-only React Flow canvas of an execution with run and validation overlays. Reloads
 * keep the viewport; measured node sizes carry over while node ids persist.
 * @category App
 */
export function GraphCanvas({ document, run, nodeErrors, selectedId, onSelect, focus }: GraphCanvasProps) {
  const built = useMemo(() => buildNodes(document, run, nodeErrors, selectedId), [document, run, nodeErrors, selectedId])
  const edges = useMemo(() => buildEdges(document, run), [document, run])
  const [nodes, setNodes] = useState<Node[]>(built)

  useEffect(() => {
    setNodes((previous) => {
      const measured = new Map(previous.map((node) => [node.id, node.measured]))
      return built.map((node) => {
        const size = measured.get(node.id)
        return size ? { ...node, measured: size } : node
      })
    })
  }, [built])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const kept = changes.filter((change) => change.type === "dimensions")
    if (kept.length > 0) setNodes((current) => applyNodeChanges(kept, current))
  }, [])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(undefined)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-surface-container-highest)" />
      <Controls showInteractive={false} />
      <FocusNode focus={focus} />
    </ReactFlow>
  )
}
