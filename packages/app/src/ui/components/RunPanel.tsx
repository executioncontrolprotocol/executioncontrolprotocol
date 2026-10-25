import type { FileRef, RunResult } from "@executioncontrolprotocol/core/types"
import { collectRunFailureMessages, isFailedRunResult } from "../lib/run-progress-sync.js"
import { PanelHeader } from "./PanelHeader.js"
import { RunInputForm } from "./RunInputForm.js"
import { RunOutputView } from "./RunOutputView.js"

/** Run UI workspace phase. @category App */
export type RunPanelPhase = "input" | "running" | "output"

/** Props for {@link RunPanel}. @category App */
export interface RunPanelProps {
  /** Current run workspace phase. */
  phase: RunPanelPhase
  /** True while the host run is in flight. */
  runBusy: boolean
  /** Start a run with collected accepts input. */
  onRun: (input?: Record<string, unknown>) => void
  /** Return to the input form. */
  onRunAgain: () => void
  /** True when a compiled workflow is loaded. */
  hasWorkflow: boolean
  /** Workflow `accepts` JSON Schema. */
  acceptsSchema?: Record<string, unknown>
  /** Workflow `returns` JSON Schema. */
  returnsSchema?: Record<string, unknown>
  /** Upload a picked file through the host media store. */
  onUploadFile?: (file: File) => Promise<FileRef>
  /** Latest run result (for output / failure display). */
  runResult?: RunResult
  /** Frozen `result.output` when available. */
  runOutputData?: unknown
  /** Resolve a host media URI for preview. */
  onReadMedia?: (uri: string) => Promise<{ bytes: string; mediaType?: string; name?: string }>
}

/**
 * Full-size run workspace: inputs → loader → outputs.
 * @category App
 */
export function RunPanel({
  phase,
  runBusy,
  onRun,
  onRunAgain,
  hasWorkflow,
  acceptsSchema,
  returnsSchema,
  onUploadFile,
  runResult,
  runOutputData,
  onReadMedia,
}: RunPanelProps) {
  const failed = isFailedRunResult(runResult)
  const failureMessages = collectRunFailureMessages(runResult)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-container">
      <PanelHeader icon="web_asset" label="Run" />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {phase === "running" || runBusy ? (
          <div
            className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3"
            role="status"
            aria-live="polite"
          >
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
              progress_activity
            </span>
            <p className="font-mono text-label text-on-surface-variant">Running workflow…</p>
          </div>
        ) : null}

        {phase === "input" && !runBusy ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
            <p className="text-body text-on-surface-variant">
              Provide any run inputs, then run the workflow.
            </p>
            <RunInputForm
              runBusy={runBusy}
              onRun={onRun}
              hasWorkflow={hasWorkflow}
              acceptsSchema={acceptsSchema}
              onUploadFile={onUploadFile}
            />
          </div>
        ) : null}

        {phase === "output" && !runBusy ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {failed ? (
              <div className="rounded-lg border border-error/40 bg-error-container/30 p-4">
                <p className="mb-2 font-mono text-label uppercase tracking-wide text-error">
                  Run failed
                </p>
                <ul className="space-y-1">
                  {failureMessages.map((message) => (
                    <li
                      key={message}
                      className="whitespace-pre-wrap font-mono text-label text-on-error-container"
                    >
                      {message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <RunOutputView
                returnsSchema={returnsSchema}
                output={runOutputData}
                onReadMedia={onReadMedia}
              />
            )}
            <div>
              <button
                type="button"
                onClick={onRunAgain}
                className="rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 font-mono text-label text-on-surface transition-colors hover:brightness-110"
              >
                Run again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
