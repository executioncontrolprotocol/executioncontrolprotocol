import type { CapabilityBlobStore } from "@executioncontrolprotocol/core"
import type { BridgeSettings } from "../lib/ecp-bridge.js"
import { collectRunFailureMessages, isFailedRunResult } from "../lib/run-progress-sync.js"
import { PanelHeader } from "./PanelHeader.js"
import { RunInputForm } from "./RunInputForm.js"
import { RunOutputView } from "./RunOutputView.js"

/** Run UI workspace phase. @category Demo */
export type RunPanelPhase = "input" | "running" | "output"

/** Props for {@link RunPanel}. */
export interface RunPanelProps {
  phase: RunPanelPhase
  runBusy: boolean
  onRun: (input?: Record<string, unknown>, blobs?: CapabilityBlobStore) => void
  onRunAgain: () => void
  hasWorkflow: boolean
  acceptsSchema?: Record<string, unknown>
  returnsSchema?: Record<string, unknown>
  bridge?: BridgeSettings
  filePickerEnabled?: boolean
  initialDrafts?: Record<string, string>
  /** Latest run result (for output / failure display). */
  runResult?: unknown
  /** Frozen `result.output` when available. */
  runOutputData?: unknown
  blobs?: CapabilityBlobStore
}

/**
 * Full-size run workspace: inputs → loader → outputs.
 * @category Demo
 */
export function RunPanel({
  phase,
  runBusy,
  onRun,
  onRunAgain,
  hasWorkflow,
  acceptsSchema,
  returnsSchema,
  bridge,
  filePickerEnabled = false,
  initialDrafts,
  runResult,
  runOutputData,
  blobs,
}: RunPanelProps) {
  const failed = isFailedRunResult(runResult)
  const failureMessages = collectRunFailureMessages(runResult)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-container">
      <PanelHeader icon="web_asset" label="Run UI" />
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
              filePickerEnabled={filePickerEnabled}
              initialDrafts={initialDrafts}
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
                bridge={bridge}
                blobs={blobs}
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
