import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { FileJson, FolderOpen, History, Workflow } from "lucide-react"
import type { RunRecord, StoredExecutionSummary } from "@executioncontrolprotocol/protocol"
import { retrieveItems, UnauthorizedError, type AppHostClient } from "../../client/index.js"
import { runStatusClass } from "./RunView.js"

const EXECUTION_LIST_LIMIT = 100
const RECENT_RUNS_LIMIT = 10

/**
 * What to open from the home view.
 * @category App
 */
export interface OpenTarget {
  /** Absolute execution file path. */
  open?: string
  /** Saved execution id. */
  id?: string
}

/**
 * Props for {@link HomeView}.
 * @category App
 */
export interface HomeViewProps {
  /** Host client. */
  client: AppHostClient
  /** Folder whose `*.ecp.json` files to list. */
  dir?: string
  /** Open a file or saved execution. */
  onOpen: (target: OpenTarget) => void
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof FileJson; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-on-surface">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof UnauthorizedError) return undefined
  return error instanceof Error ? error.message : String(error)
}

function fileName(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return cut === -1 ? path : path.slice(cut + 1)
}

/**
 * Home: execution files in `dir`, saved executions, recent runs, and a field to open any path.
 * @category App
 */
export function HomeView({ client, dir, onOpen }: HomeViewProps) {
  const [files, setFiles] = useState<Array<{ path: string; version: string }> | undefined>(undefined)
  const [filesError, setFilesError] = useState<string | undefined>(undefined)
  const [executions, setExecutions] = useState<StoredExecutionSummary[] | undefined>(undefined)
  const [runs, setRuns] = useState<RunRecord[] | undefined>(undefined)
  const [path, setPath] = useState("")

  useEffect(() => {
    let alive = true
    if (dir) {
      client
        .retrieve({ type: "execution", filter: { dir }, limit: EXECUTION_LIST_LIMIT })
        .then((response) => {
          if (!alive) return
          if (!response.ok) {
            setFilesError(response.error.message)
            return
          }
          const rows = retrieveItems<{ path: string; version: string }>(response)
          setFiles(rows)
        })
        .catch((error: unknown) => alive && setFilesError(messageOf(error)))
    }
    client
      .retrieve({ type: "execution", limit: EXECUTION_LIST_LIMIT })
      .then((response) => alive && setExecutions(retrieveItems<StoredExecutionSummary>(response)))
      .catch(() => alive && setExecutions([]))
    client
      .retrieve({ type: "run", limit: RECENT_RUNS_LIMIT })
      .then((response) => alive && setRuns(retrieveItems<RunRecord>(response)))
      .catch(() => alive && setRuns([]))
    return () => {
      alive = false
    }
  }, [client, dir])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = path.trim()
    if (value) onOpen({ open: value })
  }

  return (
    <main data-testid="home-view" className="node-canvas flex-1 overflow-auto p-canvas-padding">
      <div className="mx-auto grid max-w-5xl gap-gutter">
        <form onSubmit={submit} className="flex gap-2">
          <input
            data-testid="home-open-path"
            aria-label="Execution file path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Absolute path to an .ecp.json file"
            className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-[13px] text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            data-testid="home-open-submit"
            disabled={!path.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 font-mono text-label font-bold text-on-primary hover:brightness-110 disabled:opacity-50"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Open
          </button>
        </form>

        {dir ? (
          <Panel title={`Execution files in ${dir}`} icon={FileJson}>
            {filesError ? <p className="text-[12px] text-error">{filesError}</p> : null}
            {files === undefined && !filesError ? <p className="text-[12px] text-on-surface-variant">Loading files…</p> : null}
            {files && files.length === 0 ? (
              <p className="text-[12px] text-on-surface-variant">This folder has no .ecp.json files.</p>
            ) : null}
            {files && files.length > 0 ? (
              <ul className="space-y-1">
                {files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      data-testid="home-file"
                      data-path={file.path}
                      onClick={() => onOpen({ open: file.path })}
                      className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-container-high"
                    >
                      <span className="font-mono text-[13px] text-on-surface">{fileName(file.path)}</span>
                      <span className="truncate font-mono text-[11px] text-on-surface-variant">{file.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        ) : null}

        <div className="grid gap-gutter md:grid-cols-2">
          <Panel title="Saved executions" icon={Workflow}>
            {executions === undefined ? <p className="text-[12px] text-on-surface-variant">Loading…</p> : null}
            {executions && executions.length === 0 ? (
              <p className="text-[12px] text-on-surface-variant">No saved executions yet.</p>
            ) : null}
            {executions && executions.length > 0 ? (
              <ul className="space-y-1">
                {executions.map((execution) => (
                  <li key={execution.id}>
                    <button
                      type="button"
                      data-testid="home-execution"
                      data-id={execution.id}
                      onClick={() => onOpen({ id: execution.id })}
                      className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-container-high"
                    >
                      <span className="truncate text-[13px] text-on-surface">{execution.label ?? execution.id}</span>
                      <span className="font-mono text-[11px] text-on-surface-variant">
                        {execution.id} v{execution.version}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel title="Recent runs" icon={History}>
            {runs === undefined ? <p className="text-[12px] text-on-surface-variant">Loading…</p> : null}
            {runs && runs.length === 0 ? <p className="text-[12px] text-on-surface-variant">No runs yet.</p> : null}
            {runs && runs.length > 0 ? (
              <ul className="space-y-1">
                {runs.map((run) => {
                  const target: OpenTarget | undefined = run.execution.id
                    ? { id: run.execution.id }
                    : run.execution.path
                      ? { open: run.execution.path }
                      : undefined
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        data-testid="home-run"
                        data-run-id={run.id}
                        disabled={!target}
                        onClick={() => target && onOpen(target)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-container-high disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-on-surface">
                          {run.execution.id ?? (run.execution.path ? fileName(run.execution.path) : run.id)}
                        </span>
                        <span className={runStatusClass(run.status)}>{run.status}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </Panel>
        </div>
      </div>
    </main>
  )
}
