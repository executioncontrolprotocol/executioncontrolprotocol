import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { Repeat, Split } from "lucide-react"
import type { LiveRunState } from "../hooks/useLiveRun.js"
import { RunInputForm } from "./RunInputForm.js"
import { RunOutputView } from "./RunOutputView.js"

/**
 * Props for {@link RunView}.
 * @category App
 */
export interface RunViewProps {
  /** Open manifest (its `execution.accepts` drives the form). */
  manifest?: ExecutionManifest
  /** Live run state. */
  run: LiveRunState
  /** Start a run with the collected input. */
  onRun: (input: Record<string, unknown>) => void
}

/**
 * Status pill text and style for a run.
 * @category App
 */
export function runStatusClass(status: string | undefined): string {
  if (status === "completed") return "status-pill status-pill--valid"
  if (status === "failed" || status === "cancelled" || status === "interrupted") return "status-pill status-pill--invalid"
  return "status-pill border-outline-variant text-on-surface-variant"
}

/**
 * Run form from `execution.accepts`, live per-step status, loop rounds, branch arms, and
 * the result or error.
 * @category App
 */
export function RunView({ manifest, run, onRun }: RunViewProps) {
  const status = run.busy ? "running" : run.status
  const steps = Object.entries(run.graph.steps)
  const loops = Object.entries(run.graph.loops)
  const arms = Object.entries(run.graph.arms)
  return (
    <section data-testid="run-view" className="space-y-4">
      <RunInputForm
        acceptsSchema={manifest?.execution?.accepts as Record<string, unknown> | undefined}
        busy={run.busy}
        disabled={!manifest}
        onRun={onRun}
      />
      {run.runId || status ? (
        <div className="flex items-center gap-2">
          <span data-testid="run-status" data-status={status ?? ""} className={runStatusClass(status)}>
            {status ?? "starting"}
          </span>
          {run.runId ? (
            <span data-testid="run-id" className="truncate font-mono text-[11px] text-on-surface-variant">
              {run.runId}
            </span>
          ) : null}
        </div>
      ) : null}
      {steps.length > 0 ? (
        <ul className="space-y-1">
          {steps.map(([nodeId, step]) => (
            <li
              key={nodeId}
              data-testid="run-step"
              data-node-id={nodeId}
              data-status={step.status}
              className="flex items-center justify-between gap-2 font-mono text-[12px]"
            >
              <span className="truncate text-on-surface">{nodeId}</span>
              <span className="text-on-surface-variant">
                {step.status}
                {step.round !== undefined ? ` (round ${step.round})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {loops.length > 0 || arms.length > 0 ? (
        <ul className="space-y-1 font-mono text-[11px] text-on-surface-variant">
          {loops.map(([loopId, loop]) => (
            <li key={`loop-${loopId}`} data-testid="run-loop" data-node-id={loopId} className="flex items-center gap-1.5">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {loopId}: round {loop.round}
              {loop.exhausted ? " (reached maxRounds)" : ""}
            </li>
          ))}
          {arms.map(([branchId, arm]) => (
            <li key={`arm-${branchId}`} data-testid="run-arm" data-node-id={branchId} className="flex items-center gap-1.5">
              <Split className="h-3 w-3" aria-hidden="true" />
              {branchId}: {arm === null ? "no arm ran" : `arm ${arm}`}
            </li>
          ))}
        </ul>
      ) : null}
      {!run.busy && (run.status || run.error) ? (
        <RunOutputView result={run.result ?? (run.status === "completed" ? {} : null)} error={run.error} />
      ) : null}
      {run.refusalIssues && run.refusalIssues.length > 0 ? (
        <ul className="space-y-1">
          {run.refusalIssues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} data-testid="run-refusal-issue" className="text-[12px] text-on-surface-variant">
              <span className="font-mono text-error">{issue.code}</span> {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
