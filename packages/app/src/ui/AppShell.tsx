import { useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { InputValue, StepNode, ValidationResult, WorkflowNode } from "@executioncontrolprotocol/core/types"
import type { HostAdapter, HostLoadResult } from "../host/adapter.js"
import { workflowToReactFlow } from "../graph/workflow-to-reactflow.js"
import { renderPatchedStepInput } from "../graph/patch-source.js"
import type { ReactFlowIoData, ReactFlowStepData } from "../graph/types.js"

function isStepNode(node: WorkflowNode): node is StepNode {
  return !node.type || node.type === "step"
}

function findStep(nodes: WorkflowNode[], id: string): StepNode | undefined {
  return nodes.find((node) => isStepNode(node) && node.id === id)
}

function firstStringInput(step: StepNode): { key: string; value: string } | undefined {
  if (!step.input) return undefined
  for (const [key, value] of Object.entries(step.input)) {
    if (typeof value === "string") return { key, value }
  }
  return undefined
}

/**
 * React Flow node with a stable test id for Playwright graph edits.
 * @category App
 */
function GraphNode({ id, data }: NodeProps) {
  return (
    <div data-testid={`ecp-step-${id}`} className="ecp-rf-node">
      {String((data as { label?: string }).label ?? id)}
    </div>
  )
}

const NODE_TYPES: NodeTypes = {
  "ecp-step": GraphNode,
  "ecp-io": GraphNode,
}

/**
 * App chrome around {@link HostAdapter}. Replaces the pre-reset demo `App.tsx`.
 * @category App
 */
export function AppShell({ adapter }: { adapter: HostAdapter }) {
  const [loaded, setLoaded] = useState<HostLoadResult | undefined>()
  const [source, setSource] = useState("")
  const [loadError, setLoadError] = useState<ValidationResult | undefined>()
  const [status, setStatus] = useState("Loading")
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>()
  const [configValue, setConfigValue] = useState("")

  useEffect(() => {
    let cancelled = false
    void adapter
      .load()
      .then((next) => {
        if (cancelled) return
        setLoaded(next)
        setSource(next.source)
        setLoadError(undefined)
        setStatus(next.path)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus(error instanceof Error ? error.message : "Load failed")
      })
    const stop = adapter.watch((next) => {
      setSource(next.source)
      if (next.loadError) {
        setLoadError(next.loadError)
        return
      }
      setLoadError(undefined)
      const manifest = next.manifest
      if (!manifest) return
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              source: next.source,
              manifest,
              roundTrip: next.roundTrip ?? prev.roundTrip,
            }
          : prev
      )
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [adapter])

  const graph = useMemo(() => {
    if (!loaded?.manifest) return { nodes: [] as Node[], edges: [] as Edge[] }
    const doc = workflowToReactFlow(loaded.manifest)
    return {
      nodes: doc.nodes.map((node) => ({
        id: node.id,
        type: node.type === "ecp-io" ? "ecp-io" : "ecp-step",
        position: node.position,
        data: {
          label:
            node.type === "ecp-step"
              ? (node.data as ReactFlowStepData).label
              : (node.data as ReactFlowIoData).label,
        },
        style: node.style,
      })),
      edges: doc.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    }
  }, [loaded])

  const readOnly = loaded ? !loaded.roundTrip.ok : true
  const selectedStep = loaded && selectedStepId
    ? findStep(loaded.manifest.steps, selectedStepId)
    : undefined
  const stringInput = selectedStep ? firstStringInput(selectedStep) : undefined

  const saveStepConfig = async (): Promise<void> => {
    if (!loaded || !selectedStep || !stringInput || readOnly) return
    const nextInput: Record<string, InputValue> = {
      ...(selectedStep.input ?? {}),
      [stringInput.key]: configValue,
    }
    const next = renderPatchedStepInput(loaded.manifest, selectedStep.id, nextInput)
    await adapter.save(next)
  }

  return (
    <div className="ecp-app">
      <header className="ecp-app-bar">
        <strong>ECP App</strong>
        <span>{status}</span>
      </header>
      {readOnly && loaded ? (
        <div className="ecp-app-banner" role="status">
          Graph is read-only: {loaded.roundTrip.reasons.join("; ") || "this file cannot round-trip"}
        </div>
      ) : null}
      {loadError ? (
        <div className="ecp-app-banner" role="alert">
          {loadError.errors.map((issue) => issue.message).join("; ")}
        </div>
      ) : null}
      <div className="ecp-app-body">
        <section className="ecp-app-code">
          <h2>Source</h2>
          <textarea
            data-testid="ecp-source"
            value={source}
            readOnly={readOnly}
            onChange={(event) => setSource(event.target.value)}
            onBlur={() => {
              if (!readOnly && source !== loaded?.source) {
                void adapter.save(source)
              }
            }}
          />
        </section>
        <section className="ecp-app-graph">
          <ReactFlowProvider>
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={NODE_TYPES}
              fitView
              onNodeClick={(_event, node) => {
                if (node.type !== "ecp-step" || !loaded) return
                setSelectedStepId(node.id)
                const step = findStep(loaded.manifest.steps, node.id)
                const field = step ? firstStringInput(step) : undefined
                setConfigValue(field?.value ?? "")
              }}
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </ReactFlowProvider>
        </section>
        {selectedStep && stringInput && !readOnly ? (
          <form
            className="ecp-app-config"
            data-testid="step-config"
            onSubmit={(event) => {
              event.preventDefault()
              void saveStepConfig()
            }}
          >
            <label>
              {stringInput.key}
              <input
                data-testid="step-config-value"
                value={configValue}
                onChange={(event) => setConfigValue(event.target.value)}
              />
            </label>
            <button type="submit" data-testid="step-config-save">
              Save
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
