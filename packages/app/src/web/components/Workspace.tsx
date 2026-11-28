import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Braces, CheckCircle2, History, Network, Play, ShieldAlert, TriangleAlert } from "lucide-react"
import type { RunDetail } from "@executioncontrolprotocol/protocol"
import { nodeErrorIssues, type AppHostClient } from "../../client/index.js"
import {
  addCapabilityStep,
  addControlNode,
  executionToReactFlow,
  insertConnectedStep,
  insertConnectedControlNode,
  placeWithOverrides,
  reactFlowLayoutFitKey,
  replayRunEvents,
  type PositionOverrides,
  type ReactFlowDocument,
  deleteSelection,
  isEndNodeSelection,
  isStructureHeaderSelection,
  type DeleteSelection,
  type RunGraphState,
} from "../../graph/index.js"
import type { CapabilityEntry } from "@executioncontrolprotocol/protocol"
import { retrieveItem } from "../../client/results.js"
import { CONTROL_NODE_ENTRY_ID } from "../lib/group-capabilities.js"
import { useCapabilities } from "../hooks/useCapabilities.js"
import { useExecutionDocument, type ExecutionRetrieveHook, type ExecutionSource } from "../hooks/useExecutionDocument.js"
import { useExecutionEditor } from "../hooks/useExecutionEditor.js"
import { useLiveRun } from "../hooks/useLiveRun.js"
import { GraphCanvas, type FocusRequest, type SelectedEdge } from "./GraphCanvas.js"
import { JsonView } from "./JsonView.js"
import { EdgePanel } from "./EdgePanel.js"
import { NodePanel } from "./NodePanel.js"
import { RunsView } from "./RunsView.js"
import { RunView } from "./RunView.js"
import { ValidationView } from "./ValidationView.js"
import { CapabilityMenu, type CapabilityMenuRequest } from "./CapabilityMenu.js"
import { usePositionOverrides } from "../hooks/usePositionOverrides.js"
import type { CapabilityMenuEntry } from "../lib/group-capabilities.js"

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
  layoutKey?: string
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
  const retrieveHookRef = useRef<ExecutionRetrieveHook | undefined>(undefined)
  const doc = useExecutionDocument(client, source, onUnauthorized, {
    startRetrieve: () => retrieveHookRef.current?.startRetrieve() ?? 0,
    handleRetrieve: (item, isFirstLoad, generation) =>
      retrieveHookRef.current?.handleRetrieve(item, isFirstLoad, generation) ?? { bumpLoad: true },
  })
  const capabilities = useCapabilities(client, doc.manifest)
  const live = useLiveRun(client, source, onUnauthorized)
  const [tab, setTab] = useState<WorkspaceTab>("graph")
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([])
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | undefined>(undefined)
  const [focus, setFocus] = useState<FocusRequest | undefined>(undefined)
  const [capabilityMenu, setCapabilityMenu] = useState<CapabilityMenuRequest | undefined>(undefined)
  const [replay, setReplay] = useState<{ detail: RunDetail; graph: RunGraphState } | undefined>(undefined)
  const lastGood = useRef<ReactFlowDocument | undefined>(undefined)
  const lastLayoutKey = useRef<string | undefined>(undefined)
  const suppressNextFit = useRef(false)
  const readOnly = live.busy || replay !== undefined
  const editor = useExecutionEditor(
    client,
    source,
    doc.manifest,
    doc.version,
    doc.validation?.issues ?? [],
    readOnly,
    onUnauthorized,
  )
  retrieveHookRef.current = { startRetrieve: editor.startRetrieve, handleRetrieve: editor.handleRetrieve }
  const workingManifest = editor.local ?? doc.manifest

  const dagre = useMemo<{ document?: ReactFlowDocument; error?: string }>(() => {
    if (!workingManifest) return {}
    try {
      const capabilityMeta: Record<string, { contract?: "step"; code?: "script" | "expression" }> = {}
      for (const [id, entry] of Object.entries(capabilities.byId)) {
        if (entry.contract !== undefined || entry.code !== undefined) {
          capabilityMeta[id] = { contract: entry.contract, code: entry.code }
        }
      }
      return {
        document: executionToReactFlow(workingManifest, {
          capabilitySchemas: capabilities.schemas,
          capabilityMeta,
        }),
      }
    } catch (error) {
      return { error: `The graph could not be drawn: ${error instanceof Error ? error.message : String(error)}` }
    }
  }, [workingManifest, capabilities.schemas])
  const dagreDocument = dagre.document

  const graphIdSets = useMemo(() => {
    if (!dagreDocument) return { nonFrame: [] as string[], frames: [] as string[] }
    const nonFrame: string[] = []
    const frames: string[] = []
    for (const node of dagreDocument.nodes) {
      if (node.type === "ecp-tunnel") frames.push(node.id)
      else nonFrame.push(node.id)
    }
    return { nonFrame, frames }
  }, [dagreDocument])

  const { overrides, commit: commitOverrides, clear: clearOverrides } = usePositionOverrides(
    source,
    graphIdSets.nonFrame,
    graphIdSets.frames,
  )

  const encoded = useMemo<EncodedGraph>(() => {
    if (!dagreDocument) return { document: lastGood.current, layoutKey: lastLayoutKey.current }
    const layoutKey = reactFlowLayoutFitKey(dagreDocument)
    const document = placeWithOverrides(dagreDocument, overrides)
    lastGood.current = document
    lastLayoutKey.current = layoutKey
    return { document, layoutKey }
  }, [dagreDocument, overrides])

  const encodeError = dagre.error

  const validation = editor.validation ?? doc.validation
  const nodeErrors = useMemo(
    () => nodeErrorIssues(validation?.issues ?? [], workingManifest),
    [validation, workingManifest],
  )
  const selectedNode = encoded.document?.nodes.find((node) => node.id === selectedId)
  const selectedEdgeRecord = encoded.document?.edges.find((edge) => edge.id === selectedEdge?.edgeId)
  const overlay = replay?.graph ?? live.graph
  const startRun = live.start
  const applyManifestEdit = editor.applyEdit
  const structureEditError = editor.structureError

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readOnly || editor.conflictReplaying) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return
        if (target.closest(".monaco-editor")) return
      }
      const mod = event.metaKey || event.ctrlKey
      if (!mod) {
        if (event.key === "Delete" || event.key === "Backspace") {
          if (event.repeat) return
          if (!workingManifest) return
          const selection: DeleteSelection = (() => {
            if (selectedStepIds.length > 0) {
              return { kind: "steps", stepIds: selectedStepIds }
            }
            if (selectedEdgeRecord) {
              return { kind: "connector", edge: selectedEdgeRecord }
            }
            if (selectedId && isStructureHeaderSelection(workingManifest, selectedId)) {
              return { kind: "structure", structureId: selectedId }
            }
            if (selectedId && isEndNodeSelection(workingManifest, selectedId)) {
              return { kind: "end", endNodeId: selectedId }
            }
            return { kind: "none" }
          })()
          const edit = deleteSelection(workingManifest, selection, readOnly)
          if (edit === undefined) return
          event.preventDefault()
          void applyManifestEdit(() => edit).then((ok) => {
            if (ok) {
              setSelectedId(undefined)
              setSelectedStepIds([])
              setSelectedEdge(undefined)
            }
          })
        }
        return
      }
      if (event.key === "z" || event.key === "Z") {
        if (event.shiftKey) {
          event.preventDefault()
          void editor.redo()
        } else {
          event.preventDefault()
          void editor.undo()
        }
      } else if (event.key === "y" || event.key === "Y") {
        event.preventDefault()
        void editor.redo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    applyManifestEdit,
    editor,
    readOnly,
    selectedEdge,
    selectedEdgeRecord,
    selectedId,
    selectedStepIds,
    workingManifest,
  ])

  const selectFromIssue = useCallback((nodeId: string) => {
    setSelectedEdge(undefined)
    setSelectedId(nodeId)
    setSelectedStepIds([nodeId])
    setFocus((previous) => ({ id: nodeId, nonce: (previous?.nonce ?? 0) + 1 }))
  }, [])

  const selectFromCanvas = useCallback((nodeId: string | undefined) => {
    setSelectedId(nodeId)
    if (nodeId) setTab("graph")
  }, [])

  const selectFromEdge = useCallback((selection: SelectedEdge | undefined) => {
    setSelectedEdge(selection)
    if (selection) setTab("graph")
  }, [])

  const openCapabilityMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      placement: CapabilityMenuRequest["placement"],
      origin?: CapabilityMenuRequest["origin"],
      originPort?: CapabilityMenuRequest["originPort"],
      flowPosition?: CapabilityMenuRequest["flowPosition"],
    ) => {
      if (readOnly) return
      setCapabilityMenu({ clientX, clientY, placement, origin, originPort, flowPosition })
    },
    [readOnly],
  )

  const onPositionDragStop = useCallback(
    (updates: PositionOverrides) => {
      commitOverrides((current) => ({ ...current, ...updates }))
    },
    [commitOverrides],
  )

  const onClearPositionOverrides = useCallback(
    (nodeIds: readonly string[]) => {
      if (nodeIds.length === 0) return
      commitOverrides((current) => {
        const next = { ...current }
        for (const id of nodeIds) delete next[id]
        return next
      })
    },
    [commitOverrides],
  )

  const onAutoLayout = useCallback(() => {
    clearOverrides()
  }, [clearOverrides])

  const onCapabilityPick = useCallback(
    (entry: CapabilityMenuEntry) => {
      const request = capabilityMenu
      if (!request || readOnly) return
      setCapabilityMenu(undefined)
      let stepId: string | undefined
      const finish = (saved: boolean): void => {
        if (!saved || !stepId) return
        setSelectedEdge(undefined)
        setSelectedStepIds([stepId])
        setSelectedId(stepId)
        setTab("graph")
      }

      const pinFlowPosition = (id: string): void => {
        if (!request.flowPosition) return
        suppressNextFit.current = true
        commitOverrides((current) => ({ ...current, [id]: request.flowPosition! }))
      }

      if (request.origin && request.originPort) {
        if (entry.id === CONTROL_NODE_ENTRY_ID || entry.controlNode) {
          void applyManifestEdit((current) => {
            const result = insertConnectedControlNode(current, request.origin!, request.originPort!)
            // A control node isn't pinned: the tree layout places it with its tunnels and end.
            if (result.ok) stepId = result.structureId
            return result
          }).then(finish)
          return
        }
        void client
          .retrieve({ type: "capability", id: entry.id })
          .then((response) => {
            const capability = retrieveItem<CapabilityEntry>(response)
            if (!capability) {
              const message = response.ok ? "Capability could not be loaded." : response.error.message
              void applyManifestEdit(() => ({ ok: false, reason: message }))
              return
            }
            void applyManifestEdit((current) => {
              const result = insertConnectedStep(
                current,
                {
                  id: capability.id,
                  accepts: capability.accepts,
                  returns: capability.returns,
                  contract: capability.contract,
                  code: capability.code,
                },
                request.origin!,
                request.originPort!,
              )
              if (result.ok) {
                stepId = result.stepId
                pinFlowPosition(result.stepId)
              }
              return result
            }).then(finish)
          })
        return
      }

      void applyManifestEdit((current) => {
        if (entry.id === CONTROL_NODE_ENTRY_ID || entry.controlNode) {
          const result = addControlNode(current, request.placement)
          // A control node isn't pinned: the tree layout places it with its tunnels and end.
          if (result.ok) stepId = result.structureId
          return result
        }
        const result = addCapabilityStep(
          current,
          { id: entry.id, contract: entry.contract, code: entry.code },
          request.placement,
        )
        if (result.ok) {
          stepId = result.stepId
          pinFlowPosition(result.stepId)
        }
        return result
      }).then(finish)
    },
    [applyManifestEdit, capabilityMenu, client, commitOverrides, readOnly],
  )

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
  const title = workingManifest?.execution?.label ?? workingManifest?.execution?.id ?? sourceLabel(source)
  const valid = validation?.valid
  const saveStatusLabel =
    editor.status === "saving" ? "Saving…" : editor.status === "error" ? (editor.statusError ?? "Save failed") : "Saved"
  const versionConflictNote = editor.versionConflictNote ?? doc.versionConflictNote
  const draftDiscardNote = editor.draftDiscardNote

  return (
    <div
      data-testid="workspace"
      data-source={source.kind}
      data-selected-node={selectedId ?? ""}
      data-selected-steps={selectedStepIds.join(",")}
      data-selected-edge={selectedEdge?.edgeId ?? ""}
      data-loads={doc.loads}
      data-version={doc.version !== undefined ? String(doc.version) : ""}
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
            {valid ? "Valid" : `${validation?.issues.filter((issue) => issue.severity === "error").length ?? 0} errors`}
          </span>
        )}
        <span
          data-testid="save-status"
          data-state={editor.status}
          className="status-pill font-mono text-[11px] text-on-surface-variant"
        >
          {saveStatusLabel}
        </span>
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
      {encodeError ? (
        <div role="alert" className="shrink-0 border-b border-error/40 px-gutter py-2 text-[13px] text-error">
          {encodeError}
        </div>
      ) : null}
      {versionConflictNote ? (
        <p
          data-testid="version-conflict-note"
          className="shrink-0 border-b border-outline-variant px-gutter py-2 text-[12px] text-on-surface-variant"
        >
          {versionConflictNote}
        </p>
      ) : null}
      {draftDiscardNote ? (
        <p data-testid="draft-discard-note" className="shrink-0 border-b border-outline-variant px-gutter py-2 text-[12px] text-on-surface-variant">
          {draftDiscardNote}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section data-testid="graph-canvas" className="relative min-w-0 flex-1">
          {encoded.document && workingManifest ? (
            <>
            <GraphCanvas
              document={encoded.document}
              layoutKey={encoded.layoutKey ?? ""}
              manifest={workingManifest}
              run={overlay}
              nodeErrors={nodeErrors}
              selectedId={selectedId}
              selectedStepIds={selectedStepIds}
              readOnly={readOnly}
              positionDragOnly={replay !== undefined}
              selectedEdge={selectedEdge}
              onSelect={selectFromCanvas}
              onSelectSteps={setSelectedStepIds}
              onSelectEdge={selectFromEdge}
              applyEdit={applyManifestEdit}
              focus={focus}
              onOpenCapabilityMenu={readOnly ? undefined : openCapabilityMenu}
              onMenuDismiss={() => setCapabilityMenu(undefined)}
              onPositionDragStop={onPositionDragStop}
              onClearPositionOverrides={onClearPositionOverrides}
              onAutoLayout={onAutoLayout}
              suppressNextFitRef={suppressNextFit}
              onUndo={() => void editor.undo()}
              onRedo={() => void editor.redo()}
              undoDisabled={readOnly || editor.conflictReplaying || !editor.canUndo}
              redoDisabled={readOnly || editor.conflictReplaying || !editor.canRedo}
            />
            {capabilityMenu && !readOnly ? (
              <CapabilityMenu
                client={client}
                request={capabilityMenu}
                onClose={() => setCapabilityMenu(undefined)}
                onPick={(entry) => onCapabilityPick(entry)}
              />
            ) : null}
            </>
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
              <>
              {structureEditError ? (
                <p className="mb-3 text-[11px] text-error" data-testid="structure-edit-error">
                  {structureEditError}
                </p>
              ) : null}
              {selectedEdgeRecord ? (
                <EdgePanel
                  manifest={workingManifest}
                  edge={selectedEdgeRecord}
                  readOnly={readOnly}
                  applyManifestEdit={applyManifestEdit}
                  onDeleted={() => setSelectedEdge(undefined)}
                />
              ) : (
                <NodePanel
                  client={client}
                  source={source}
                  manifest={workingManifest}
                  executionPath={source.kind === "path" ? source.path : undefined}
                  node={selectedNode}
                  capability={selectedUses ? capabilities.byId[selectedUses] : undefined}
                  issues={selectedId ? (nodeErrors[selectedId] ?? []) : []}
                  runStep={selectedId ? overlay.steps[selectedId] : undefined}
                  runLoopItems={selectedId ? overlay.loopItems[selectedId] : undefined}
                  runLoop={selectedId ? overlay.loops[selectedId] : undefined}
                  reloadKey={editor.externalEpoch}
                  onUnauthorized={onUnauthorized}
                  readOnly={readOnly}
                  applyManifestEdit={applyManifestEdit}
                  scheduleTextEdit={editor.scheduleText}
                  flushTextEdit={editor.flushText}
                  fieldEpoch={editor.fieldEpoch}
                  onOpenCapabilityMenu={readOnly ? undefined : openCapabilityMenu}
                />
              )}
              </>
            ) : null}
            {tab === "validation" ? (
              <ValidationView
                validation={validation}
                manifest={workingManifest}
                loadError={doc.loadError}
                onSelectNode={selectFromIssue}
              />
            ) : null}
            {tab === "run" ? <RunView manifest={workingManifest} run={live} onRun={onRun} client={client} /> : null}
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
            {tab === "json" ? <JsonView manifest={workingManifest} /> : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
