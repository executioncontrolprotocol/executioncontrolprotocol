import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  LATEST_ECP_VERSION,
  type RunResult,
  type ValidationResult,
  type WorkflowManifest,
} from "@executioncontrolprotocol/core/types"
import type { HostAdapter, HostLoadResult } from "../host/adapter.js"
import type { AppSourceResponse } from "../host/protocol.js"
import {
  applyPublicRunEvent,
  reactFlowRunProgress,
  renderPatchedManifest,
  shouldApplyWatchedSource,
  workflowToReactFlow,
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
  type ReactFlowIoData,
  type ReactFlowIoKind,
  type ReactFlowStepData,
} from "../graph/index.js"
import { CodePanel } from "./components/CodePanel.js"
import { IoConfigureDialog } from "./components/IoConfigureDialog.js"
import { ReactFlowCanvas } from "./components/ReactFlowCanvas.js"
import { RunPanel, type RunPanelPhase } from "./components/RunPanel.js"
import { SplitPane } from "./components/SplitPane.js"
import { StepConfigureDialog } from "./components/StepConfigureDialog.js"
import { useSplitPane } from "./hooks/useSplitPane.js"
import { formatFluentManifest } from "./lib/fluent-beautify.js"
import {
  applyIoConfigure,
  applyStepConfigure,
  connectPorts,
  disconnectPorts,
  patchOpsForManifest,
} from "./lib/graph-edit.js"
import { findStepById } from "./lib/step-configure.js"
import { ioFieldsFromSchema, workflowContract } from "./lib/workflow-io.js"

const SOURCE_SAVE_DEBOUNCE_MS = 400

type WorkspaceTab = "workflow" | "run"

function snapshotToLoaded(prev: HostLoadResult | undefined, snapshot: AppSourceResponse): HostLoadResult | undefined {
  if (!snapshot.manifest || !snapshot.requirements) return prev
  if (!prev) {
    return {
      path: snapshot.path,
      source: snapshot.source,
      manifest: snapshot.manifest,
      requirements: snapshot.requirements,
      roundTrip: snapshot.roundTrip,
    }
  }
  return {
    ...prev,
    path: snapshot.path,
    source: snapshot.source,
    manifest: snapshot.manifest,
    requirements: snapshot.requirements,
    roundTrip: snapshot.roundTrip,
  }
}

function toRunResult(response: {
  runId: string
  status: RunResult["run"]["status"]
  output?: Record<string, unknown>
  diagnostics?: RunResult["diagnostics"]
  history?: RunResult["history"]
}): RunResult {
  return {
    schema: "@executioncontrolprotocol.run.result",
    version: LATEST_ECP_VERSION,
    run: { id: response.runId, status: response.status },
    output: response.output,
    diagnostics: response.diagnostics,
    history: response.history,
  }
}

/**
 * App chrome around {@link HostAdapter}. Replaces the pre-reset demo `App.tsx`.
 * @category App
 */
export function AppShell({ adapter }: { adapter: HostAdapter }) {
  const [loaded, setLoaded] = useState<HostLoadResult | undefined>()
  const [source, setSource] = useState("")
  const [editorKey, setEditorKey] = useState(0)
  const [loadError, setLoadError] = useState<ValidationResult | undefined>()
  const [status, setStatus] = useState("Loading")
  const [diskChanged, setDiskChanged] = useState(false)
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("workflow")
  const [configureStepId, setConfigureStepId] = useState<string | undefined>()
  const [configureIoKind, setConfigureIoKind] = useState<ReactFlowIoKind | undefined>()
  const [configureBusy, setConfigureBusy] = useState(false)
  const [configureError, setConfigureError] = useState<string | null>(null)
  const [runPhase, setRunPhase] = useState<RunPanelPhase>("input")
  const [runBusy, setRunBusy] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | undefined>()

  const acknowledgedRef = useRef("")
  const sourceRef = useRef("")
  const saveGeneration = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const split = useSplitPane()

  sourceRef.current = source

  const remountEditor = useCallback((nextSource: string) => {
    setSource(nextSource)
    sourceRef.current = nextSource
    setEditorKey((key) => key + 1)
  }, [])

  const persist = useCallback(
    async (nextSource: string, options?: { remount?: boolean }): Promise<AppSourceResponse> => {
      saveGeneration.current += 1
      const snapshot = await adapter.save(nextSource)
      acknowledgedRef.current = snapshot.source
      setDiskChanged(false)
      if (snapshot.loadError) {
        setLoadError(snapshot.loadError)
        if (options?.remount) remountEditor(snapshot.source)
        return snapshot
      }
      setLoadError(undefined)
      const nextLoaded = snapshotToLoaded(loaded, snapshot)
      if (nextLoaded) setLoaded(nextLoaded)
      if (options?.remount) remountEditor(snapshot.source)
      else setSource(snapshot.source)
      return snapshot
    },
    [adapter, loaded, remountEditor]
  )

  const persistManifest = useCallback(
    async (nextManifest: WorkflowManifest): Promise<void> => {
      if (!loaded) return
      const ops = patchOpsForManifest(loaded.manifest, nextManifest)
      if (ops.length === 0) return
      const fluent = renderPatchedManifest(loaded.manifest, ops)
      await persist(fluent, { remount: true })
    },
    [loaded, persist]
  )

  useEffect(() => {
    let cancelled = false
    void adapter
      .load()
      .then((next) => {
        if (cancelled) return
        setLoaded(next)
        acknowledgedRef.current = next.source
        remountEditor(next.source)
        setLoadError(undefined)
        setStatus(next.path)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus(error instanceof Error ? error.message : "Load failed")
      })
    const stop = adapter.watch((next) => {
      if (shouldApplyWatchedSource(sourceRef.current, acknowledgedRef.current)) {
        acknowledgedRef.current = next.source
        remountEditor(next.source)
        setDiskChanged(false)
        if (next.loadError) {
          setLoadError(next.loadError)
          return
        }
        setLoadError(undefined)
        if (!next.manifest) return
        setLoaded((prev) =>
          prev
            ? {
                ...prev,
                source: next.source,
                manifest: next.manifest!,
                roundTrip: next.roundTrip ?? prev.roundTrip,
              }
            : prev
        )
        return
      }
      setDiskChanged(true)
    })
    return () => {
      cancelled = true
      stop()
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [adapter, remountEditor])

  const onFluentChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return
      setSource(value)
      sourceRef.current = value
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const generation = saveGeneration.current + 1
      saveGeneration.current = generation
      saveTimer.current = setTimeout(() => {
        if (generation !== saveGeneration.current) return
        void persist(value)
      }, SOURCE_SAVE_DEBOUNCE_MS)
    },
    [persist]
  )

  const graphJson = useMemo(() => {
    if (!loaded?.manifest) return ""
    return JSON.stringify(workflowToReactFlow(loaded.manifest))
  }, [loaded])

  const readOnly = loaded ? !loaded.roundTrip.ok : true
  const io = loaded ? workflowContract(loaded.manifest) : {}
  const graphDoc = useMemo(() => {
    if (!loaded?.manifest) return undefined
    return workflowToReactFlow(loaded.manifest)
  }, [loaded])

  const configureStep = configureStepId
    ? findStepById(loaded?.manifest.steps ?? [], configureStepId)
    : undefined
  const configureStepData = graphDoc?.nodes.find((node) => node.id === configureStepId)?.data as
    | ReactFlowStepData
    | undefined
  const configureIoNode = configureIoKind
    ? graphDoc?.nodes.find(
        (node) =>
          node.id ===
          (configureIoKind === "accepts" ? WORKFLOW_ACCEPTS_NODE_ID : WORKFLOW_RETURNS_NODE_ID)
      )
    : undefined
  const configureIoData = configureIoNode?.data as ReactFlowIoData | undefined

  const onConfigureNode = useCallback(
    (id: string) => {
      if (readOnly) return
      setConfigureError(null)
      if (id === WORKFLOW_ACCEPTS_NODE_ID) {
        setConfigureStepId(undefined)
        setConfigureIoKind("accepts")
        return
      }
      if (id === WORKFLOW_RETURNS_NODE_ID) {
        setConfigureStepId(undefined)
        setConfigureIoKind("returns")
        return
      }
      setConfigureIoKind(undefined)
      setConfigureStepId(id)
    },
    [readOnly]
  )

  const saveGraphEdit = useCallback(
    async (result: { ok: true; manifest: WorkflowManifest } | { ok: false; error: string }) => {
      if (!result.ok) {
        setStatus(result.error)
        setConfigureError(result.error)
        return
      }
      try {
        await persistManifest(result.manifest)
        setConfigureError(null)
        setConfigureStepId(undefined)
        setConfigureIoKind(undefined)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setStatus(message)
        setConfigureError(message)
      }
    },
    [persistManifest]
  )

  const compileError = loadError?.errors.map((issue) => issue.message).join("; ") ?? null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-on-background">
      <header className="flex shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-2">
        <strong className="font-display text-sm tracking-wide">ECP App</strong>
        <span className="truncate font-mono text-label text-on-surface-variant">{status}</span>
      </header>
      {readOnly && loaded ? (
        <div className="ecp-app-banner border-b border-outline-variant bg-surface-container px-4 py-2 text-label text-on-surface-variant" role="status">
          Graph is read-only: {loaded.roundTrip.reasons.join("; ") || "this file cannot round-trip"}
        </div>
      ) : null}
      {diskChanged ? (
        <div className="border-b border-outline-variant bg-secondary-container/40 px-4 py-2 text-label text-on-surface" role="status">
          The file changed on disk. Your editor still has unsaved local edits.
        </div>
      ) : null}
      {loadError && !compileError ? (
        <div className="border-b border-error-container bg-error-container/20 px-4 py-2 text-label text-error" role="alert">
          {loadError.errors.map((issue) => issue.message).join("; ")}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SplitPane
          left={
            <CodePanel
              fluent={source}
              fluentEditorKey={editorKey}
              compileError={compileError}
              onFluentChange={onFluentChange}
              beautifyEnabled={Boolean(loaded) && !readOnly}
              onBeautifyFluent={
                loaded && !readOnly
                  ? () => void persist(formatFluentManifest(loaded.manifest), { remount: true })
                  : undefined
              }
            />
          }
          right={
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <nav className="flex shrink-0 border-b border-outline-variant bg-surface-container-low px-2">
                {(
                  [
                    ["workflow", "Workflow"],
                    ["run", "Run"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`ecp-tab-${id}`}
                    onClick={() => setWorkspaceTab(id)}
                    className={`px-4 py-2 font-mono text-label uppercase tracking-widest transition-colors ${
                      workspaceTab === id
                        ? "border-b-2 border-primary text-primary"
                        : "text-on-surface-variant hover:text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div
                className={
                  workspaceTab === "workflow"
                    ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
                    : "hidden min-h-0 flex-1"
                }
              >
                <ReactFlowCanvas
                  reactflowJson={graphJson}
                  runBusy={runBusy}
                  onOpenRunTab={() => setWorkspaceTab("run")}
                  hasWorkflow={Boolean(loaded?.manifest)}
                  onConfigureStep={readOnly ? undefined : onConfigureNode}
                  onConnectPorts={
                    readOnly || !loaded
                      ? undefined
                      : (connection) => void saveGraphEdit(connectPorts(loaded.manifest, connection))
                  }
                  onDisconnectPorts={
                    readOnly || !loaded
                      ? undefined
                      : (connection) => void saveGraphEdit(disconnectPorts(loaded.manifest, connection))
                  }
                  readOnly={readOnly}
                />
              </div>
              <div
                className={
                  workspaceTab === "run"
                    ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
                    : "hidden min-h-0 flex-1"
                }
              >
                <RunPanel
                  phase={runPhase}
                  runBusy={runBusy}
                  hasWorkflow={Boolean(loaded?.manifest)}
                  acceptsSchema={io.accepts}
                  returnsSchema={io.returns}
                  runResult={runResult}
                  runOutputData={runResult?.output}
                  onUploadFile={(file) => adapter.uploadMedia(file)}
                  onReadMedia={(uri) => adapter.readMedia(uri)}
                  onRunAgain={() => {
                    setRunPhase("input")
                    setRunResult(undefined)
                  }}
                  onRun={(input) => {
                    void (async () => {
                      setRunBusy(true)
                      setRunPhase("running")
                      try {
                        const response = await adapter.run(sourceRef.current, input ?? {}, (event) => {
                          applyPublicRunEvent(reactFlowRunProgress, event)
                        })
                        setRunResult(toRunResult(response))
                        setRunPhase("output")
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error)
                        setRunResult({
                          schema: "@executioncontrolprotocol.run.result",
                          version: LATEST_ECP_VERSION,
                          run: { id: "local", status: "failed" },
                          diagnostics: [{ code: "ECP_WORKFLOW_LOAD", message, severity: "error" }],
                        })
                        setRunPhase("output")
                        setStatus(message)
                      } finally {
                        setRunBusy(false)
                      }
                    })()
                  }}
                />
              </div>
            </div>
          }
          leftWidth={split.leftWidth}
          onDividerPointerDown={split.onPointerDown}
        />
      </div>
      {configureStepId && configureStep && configureStepData && !readOnly ? (
        <StepConfigureDialog
          stepId={configureStepId}
          step={configureStepData}
          originalInput={(configureStep.input ?? {}) as Record<string, unknown>}
          busy={configureBusy}
          error={configureError}
          onUploadFile={(file) => adapter.uploadMedia(file)}
          onClose={() => {
            setConfigureStepId(undefined)
            setConfigureError(null)
          }}
          onSave={(payload) => {
            if (!loaded) return
            setConfigureBusy(true)
            void saveGraphEdit(applyStepConfigure(loaded.manifest, configureStepId, payload)).finally(
              () => setConfigureBusy(false)
            )
          }}
        />
      ) : null}
      {configureIoKind && configureIoData && loaded && !readOnly ? (
        <IoConfigureDialog
          kind={configureIoKind}
          data={configureIoData}
          fields={ioFieldsFromSchema(
            configureIoKind === "accepts" ? io.accepts : io.returns
          )}
          busy={configureBusy}
          error={configureError}
          onClose={() => {
            setConfigureIoKind(undefined)
            setConfigureError(null)
          }}
          onSave={(payload) => {
            setConfigureBusy(true)
            void saveGraphEdit(applyIoConfigure(loaded.manifest, payload)).finally(() =>
              setConfigureBusy(false)
            )
          }}
        />
      ) : null}
    </div>
  )
}
