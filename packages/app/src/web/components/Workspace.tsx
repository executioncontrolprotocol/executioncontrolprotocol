import { useCallback, useMemo, useRef, useState } from "react"
import { Braces, CheckCircle2, History, Network, Play, ShieldAlert, TriangleAlert } from "lucide-react"
import type { RunDetail } from "@executioncontrolprotocol/protocol"
import { nodeErrorIssues, type AppHostClient } from "../../client/index.js"
import {
  executionToReactFlow,
  replayRunEvents,
  type ReactFlowDocument,
  type RunGraphState,
} from "../../graph/index.js"
import { useCapabilities } from "../hooks/useCapabilities.js"
import { useExecutionDocument, type ExecutionSource } from "../hooks/useExecutionDocument.js"
import { useLiveRun } from "../hooks/useLiveRun.js"
import { GraphCanvas, type FocusRequest } from "./GraphCanvas.js"
import { JsonView } from "./JsonView.js"
import { NodePanel } from "./NodePanel.js"
import { RunsView } from "./RunsView.js"
import { RunView } from "./RunView.js"
import { ValidationView } from "./ValidationView.js"

/**
 * Sidebar tab of the execution workspace.
 * @category App
 */
export type WorkspaceTab = "graph" | "validation" | "run" | "runs" | "json"

const TABS: Array<{ id: WorkspaceTab; label: string; icon: typeof Network }> = [
  { id: "graph", label: "Graph", icon: Network },
  { id: "validation", label: "Validation", icon: TriangleAlert },
  { id: "run", label: "Run", icon: Play },
  { id: "runs", label: "Runs", icon: History },
  { id: "json", label: "JSON", icon: Braces },
]

/**
 * Props for {@link Workspace}.
 * @category App
 */
export interface WorkspaceProps {
  /** Host client. */
  client: AppHostClient
  /** Execution to open. Must be referentially stable. */
  source: ExecutionSource
  /** Switch the App to its unauthorised screen. */
  onUnauthorized: () => void
}

interface EncodedGraph {
  document?: ReactFlowDocument
  error?: string
}

function sourceLabel(source: ExecutionSource): string {
  return source.kind === "path" ? source.path : source.id
}

/**
 * Execution workspace: graph canvas with run / validation overlays and a tabbed sidebar
 * (Graph, Validation, Run, Runs, JSON). Hot reload keeps selection and the viewport, and
 * never interrupts the run panel.
 * @category App
 */
export function Workspace({ client, source, onUnauthorized }: WorkspaceProps) {
  const doc = useExecutionDocument(client, source, onUnauthorized)
  const capabilities = useCapabilities(client)
  const live = useLiveRun(client, source, onUnauthorized)
  const [tab, setTab] = useState<WorkspaceTab>("graph")
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [focus, setFocus] = useState<FocusRequest | undefined>(undefined)
  const [replay, setReplay] = useState<{ detail: RunDetail; graph: RunGraphState } | undefined>(undefined)
  const lastGood = useRef<ReactFlowDocument | undefined>(undefined)

  const encoded = useMemo<EncodedGraph>(() => {
    if (!doc.manifest) return { document: lastGood.current }
    try {
      const document = executionToReactFlow(doc.manifest, { capabilitySchemas: capabilities.schemas })
      lastGood.current = document
      return { document }
    } catch (error) {
      return {
        document: lastGood.current,
        error: `The graph could not be drawn: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }, [doc.manifest, capabilities.schemas])

  const nodeErrors = useMemo(
    () => nodeErrorIssues(doc.validation?.issues ?? [], doc.manifest),
    [doc.validation, doc.manifest],
  )
  const selectedNode = encoded.document?.nodes.find((node) => node.id === selectedId)
  const overlay = replay?.graph ?? live.graph
  const startRun = live.start

  const selectFromIssue = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setFocus((previous) => ({ id: nodeId, nonce: (previous?.nonce ?? 0) + 1 }))
  }, [])

  const selectFromCanvas = useCallback((nodeId: string | undefined) => {
    setSelectedId(nodeId)
    if (nodeId) setTab("graph")
  }, [])

  const onRun = useCallback(
    (input: Record<string, unknown>) => {
      setReplay(undefined)
      startRun(input)
    },
    [startRun],
  )

  const onReplay = useCallback((detail: RunDetail | undefined) => {
    setReplay(detail ? { detail, graph: replayRunEvents(detail.events ?? []) } : undefined)
  }, [])

  const selectedUses =
    selectedNode?.type === "ecp-step" ? (selectedNode.data as { uses: string }).uses : undefined
  const title = doc.manifest?.execution?.label ?? doc.manifest?.execution?.id ?? sourceLabel(source)
  const valid = doc.validation?.valid

  return (
    <div
      data-testid="workspace"
      data-source={source.kind}
      data-selected-node={selectedId ?? ""}
      data-loads={doc.loads}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-gutter py-2">
        <div className="min-w-0 flex-1">
          <h2 data-testid="workspace-title" className="truncate font-display text-[15px] font-semibold text-on-surface">
            {title}
          </h2>
          <p className="truncate font-mono text-[11px] text-on-surface-variant">{sourceLabel(source)}</p>
        </div>
        {valid === undefined ? null : (
          <span
            data-testid="validation-status"
            data-valid={String(valid)}
            className={`status-pill ${valid ? "status-pill--valid" : "status-pill--invalid"}`}
          >
            {valid ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
            {valid ? "Valid" : `${doc.validation?.issues.filter((issue) => issue.severity === "error").length ?? 0} errors`}
          </span>
        )}
      </div>

      {doc.loadError ? (
        <div
          data-testid="load-error"
          data-code={doc.loadError.code}
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-error/40 bg-error-container/30 px-gutter py-2 text-[13px] text-on-error-container"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
          <span>
            <span className="font-mono text-error">{doc.loadError.code}</span> {doc.loadError.message}
            {doc.manifest ? " The last good version stays on screen until the next good save." : ""}
          </span>
        </div>
      ) : null}
      {encoded.error ? (
        <div role="alert" className="shrink-0 border-b border-error/40 px-gutter py-2 text-[13px] text-error">
          {encoded.error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section data-testid="graph-canvas" className="relative min-w-0 flex-1">
          {encoded.document ? (
            <GraphCanvas
              document={encoded.document}
              run={overlay}
              nodeErrors={nodeErrors}
              selectedId={selectedId}
              onSelect={selectFromCanvas}
              focus={focus}
            />
          ) : (
            <div className="node-canvas flex h-full items-center justify-center text-[13px] text-on-surface-variant">
              {doc.loading ? "Loading the execution…" : "The execution could not be loaded."}
            </div>
          )}
        </section>

        <aside className="flex w-[420px] shrink-0 flex-col border-l border-outline-variant bg-surface-container-low">
          <nav role="tablist" className="flex shrink-0 border-b border-outline-variant">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={`tab-${id}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 font-mono text-label ${
                  tab === id
                    ? "border-primary text-on-surface"
                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
                {id === "validation" && valid === false ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-error" aria-hidden="true" />
                ) : null}
                {id === "run" && live.busy ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary-fixed-dim" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === "graph" ? (
              <NodePanel
                client={client}
                manifest={doc.manifest}
                executionPath={source.kind === "path" ? source.path : undefined}
                node={selectedNode}
                capability={selectedUses ? capabilities.byId[selectedUses] : undefined}
                issues={selectedId ? (nodeErrors[selectedId] ?? []) : []}
                runStep={selectedId ? overlay.steps[selectedId] : undefined}
                reloadKey={doc.loads}
              />
            ) : null}
            {tab === "validation" ? (
              <ValidationView
                validation={doc.validation}
                manifest={doc.manifest}
                loadError={doc.loadError}
                onSelectNode={selectFromIssue}
              />
            ) : null}
            {tab === "run" ? <RunView manifest={doc.manifest} run={live} onRun={onRun} /> : null}
            {tab === "runs" ? (
              <RunsView
                client={client}
                source={source}
                executionId={doc.manifest?.execution?.id}
                refreshKey={doc.runChanges}
                replay={replay?.detail}
                onReplay={onReplay}
              />
            ) : null}
            {tab === "json" ? <JsonView manifest={doc.manifest} /> : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
