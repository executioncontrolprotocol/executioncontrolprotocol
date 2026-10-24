import { useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { HostAdapter, HostLoadResult } from "../host/adapter.js"
import { workflowToReactFlow } from "../graph/workflow-to-reactflow.js"
import type { ReactFlowIoData, ReactFlowStepData } from "../graph/types.js"
import type { ValidationResult } from "@executioncontrolprotocol/core/types"

/**
 * App chrome around {@link HostAdapter}. Replaces the pre-reset demo `App.tsx`.
 * @category App
 */
export function AppShell({ adapter }: { adapter: HostAdapter }) {
  const [loaded, setLoaded] = useState<HostLoadResult | undefined>()
  const [source, setSource] = useState("")
  const [loadError, setLoadError] = useState<ValidationResult | undefined>()
  const [status, setStatus] = useState("Loading")

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
        type: "default",
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
            <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView>
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </ReactFlowProvider>
        </section>
      </div>
    </div>
  )
}
