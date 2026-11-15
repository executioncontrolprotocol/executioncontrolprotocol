import { useEffect, useState } from "react"
import { History, RotateCcw } from "lucide-react"
import type { RunDetail, RunRecord } from "@executioncontrolprotocol/protocol"
import { retrieveItem, retrieveItems, samePath, UnauthorizedError, type AppHostClient } from "../../client/index.js"
import type { ExecutionSource } from "../hooks/useExecutionDocument.js"
import { RunOutputView } from "./RunOutputView.js"
import { runStatusClass } from "./RunView.js"

const RUN_LIST_LIMIT = 100

/**
 * Props for {@link RunsView}.
 * @category App
 */
export interface RunsViewProps {
  /** Host client. */
  client: AppHostClient
  /** Open execution. */
  source: ExecutionSource
  /** Execution id from the manifest, for path-opened executions that have one. */
  executionId?: string
  /** Changes whenever runs change on the host; the list reloads. */
  refreshKey: number
  /** Replayed run, if any. */
  replay?: RunDetail
  /** Show a run's statuses on the graph, or clear the replay with undefined. */
  onReplay: (detail: RunDetail | undefined) => void
}

function belongsTo(run: RunRecord, source: ExecutionSource, executionId: string | undefined): boolean {
  if (source.kind === "id") return run.execution.id === source.id
  if (samePath(run.execution.path, source.path)) return true
  return executionId !== undefined && run.execution.id === executionId
}

function duration(run: RunRecord): string {
  return run.durationMs !== undefined ? `${run.durationMs} ms` : ""
}

function ReplayDetail({ detail }: { detail: RunDetail }) {
  return (
    <div data-testid="run-replay" data-run-id={detail.id} className="space-y-3">
      <RunOutputView result={detail.result ?? (detail.status === "completed" ? {} : null)} error={detail.error} />
      {detail.steps && detail.steps.length > 0 ? (
        <div className="space-y-2">
          <p className="font-mono text-label uppercase text-on-surface-variant">Steps</p>
          {detail.steps.map((step) => (
            <details
              key={`${step.nodeId}-${step.round ?? ""}`}
              data-testid="run-replay-step"
              data-node-id={step.nodeId}
              data-status={step.status}
              className="rounded border border-outline-variant bg-surface-container-lowest"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-mono text-[12px]">
                <span className="text-on-surface">
                  {step.nodeId}
                  {step.round !== null ? ` (round ${step.round})` : ""}
                </span>
                <span className="text-on-surface-variant">{step.status}</span>
              </summary>
              <div className="space-y-2 px-3 pb-3">
                <p className="font-mono text-label uppercase text-on-surface-variant">Input</p>
                <pre className="max-h-48 overflow-auto font-mono text-[11px] text-on-surface">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
                <p className="font-mono text-label uppercase text-on-surface-variant">Output</p>
                <pre className="max-h-48 overflow-auto font-mono text-[11px] text-on-surface">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
                {step.error ? <p className="text-[12px] text-error">{step.error.message}</p> : null}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Run history for the open execution. Selecting a run replays its statuses on the graph and
 * shows its redacted step inputs and outputs.
 * @category App
 */
export function RunsView({ client, source, executionId, refreshKey, replay, onReplay }: RunsViewProps) {
  const [runs, setRuns] = useState<RunRecord[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [opening, setOpening] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const filter = source.kind === "id" ? { executionId: source.id } : undefined
    client
      .retrieve({ type: "run", ...(filter ? { filter } : {}), limit: RUN_LIST_LIMIT })
      .then((response) => {
        if (!alive) return
        if (!response.ok) {
          setError(response.error.message)
          return
        }
        setError(undefined)
        setRuns(retrieveItems<RunRecord>(response).filter((run) => belongsTo(run, source, executionId)))
      })
      .catch((caught: unknown) => {
        if (alive && !(caught instanceof UnauthorizedError)) setError(String(caught))
      })
    return () => {
      alive = false
    }
  }, [client, source, executionId, refreshKey])

  const open = (runId: string) => {
    setOpening(runId)
    client
      .retrieve({ type: "run", id: runId, include: ["steps", "events"] })
      .then((response) => {
        const detail = retrieveItem<RunDetail>(response)
        if (detail) onReplay(detail)
        else if (!response.ok) setError(response.error.message)
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof UnauthorizedError)) setError(String(caught))
      })
      .finally(() => setOpening(undefined))
  }

  return (
    <section data-testid="runs-view" className="space-y-4">
      {error ? <p className="text-[12px] text-error">{error}</p> : null}
      {runs === undefined ? (
        <p className="text-[12px] text-on-surface-variant">Loading runs…</p>
      ) : runs.length === 0 ? (
        <p data-testid="runs-empty" className="text-[12px] text-on-surface-variant">
          No runs yet. Start one from the Run tab.
        </p>
      ) : (
        <ul className="space-y-1">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                data-testid="run-history-item"
                data-run-id={run.id}
                data-status={run.status}
                aria-pressed={replay?.id === run.id}
                onClick={() => open(run.id)}
                className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left hover:border-primary ${
                  replay?.id === run.id ? "border-primary bg-surface-container-high" : "border-outline-variant"
                }`}
              >
                <History className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-on-surface">{run.id}</span>
                <span className="font-mono text-[10px] text-on-surface-variant">{duration(run)}</span>
                <span className={runStatusClass(run.status)}>{opening === run.id ? "loading" : run.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {replay ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-label uppercase text-on-surface-variant">Replaying {replay.id}</p>
            <button
              type="button"
              data-testid="runs-clear-replay"
              onClick={() => onReplay(undefined)}
              className="inline-flex items-center gap-1 font-mono text-label text-primary hover:brightness-110"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Clear replay
            </button>
          </div>
          <ReplayDetail detail={replay} />
        </div>
      ) : null}
    </section>
  )
}
