import type { RunEvent, ValidationIssue } from "@executioncontrolprotocol/protocol"
import type { ReactFlowRunProgress } from "./progress.js"
import type {
  ReactFlowArmRunState,
  ReactFlowRouteEdgeData,
  ReactFlowRunOutcome,
  ReactFlowStepStatus,
} from "./types.js"

const CANCELLED_CODE = "ECP_RUN_CANCELLED"

/**
 * Status of one step on the graph during or after a run.
 * @category App
 */
export interface RunGraphStep {
  /** Latest status. */
  status: ReactFlowStepStatus
  /** Loop round of the latest status, when the step runs inside a loop. */
  round?: number
  /** Failure message, when the step failed. */
  message?: string
}

/**
 * Loop progress on the graph.
 * @category App
 */
export interface RunGraphLoop {
  /** Latest round started (0-based). */
  round: number
  /** True when the loop stopped because it reached `maxRounds`. */
  exhausted: boolean
}

/**
 * Run status as the graph shows it, folded from run events.
 * @category App
 */
export interface RunGraphState {
  /** `idle` before `run.start`, `running` until `run.end`, then the outcome. */
  status: "idle" | "running" | ReactFlowRunOutcome
  /** Step id to its latest status. Steps without events are absent. */
  steps: Record<string, RunGraphStep>
  /** Branch id to the selected arm index (`null` when no arm ran). */
  arms: Record<string, number | null>
  /** Loop id to its progress. */
  loops: Record<string, RunGraphLoop>
  /** Last `seq` applied. */
  lastSeq: number
}

/**
 * Empty graph run state (before any event).
 * @category App
 */
export function createRunGraphState(): RunGraphState {
  return { status: "idle", steps: {}, arms: {}, loops: {}, lastSeq: 0 }
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === "string" ? value : undefined
}

function roundField(data: Record<string, unknown>): number | undefined {
  const value = data.round
  return typeof value === "number" ? value : undefined
}

function issueField(data: Record<string, unknown>): Partial<ValidationIssue> | undefined {
  const value = data.error
  return value !== null && typeof value === "object" ? (value as Partial<ValidationIssue>) : undefined
}

function outcomeFromStatus(status: string | undefined): ReactFlowRunOutcome {
  if (status === "failed" || status === "cancelled" || status === "interrupted") return status
  return "completed"
}

function withStep(
  state: RunGraphState,
  nodeId: string,
  status: ReactFlowStepStatus,
  round: number | undefined,
  message?: string,
): RunGraphState {
  const step: RunGraphStep = {
    status,
    ...(round !== undefined ? { round } : {}),
    ...(message ? { message } : {}),
  }
  return { ...state, steps: { ...state.steps, [nodeId]: step } }
}

function cancelRunning(steps: Record<string, RunGraphStep>): Record<string, RunGraphStep> {
  const next: Record<string, RunGraphStep> = {}
  for (const [id, step] of Object.entries(steps)) {
    next[id] = step.status === "running" ? { ...step, status: "cancelled" } : step
  }
  return next
}

/**
 * Fold one run event into the graph run state. Pure; returns a new state.
 * `run.start` resets everything. Steps still running when the run ends become
 * `cancelled` (the executor emits no event for steps it aborts).
 * @category App
 */
export function reduceRunEvent(state: RunGraphState, event: RunEvent): RunGraphState {
  const data = event.data ?? {}
  const nodeId = stringField(data, "nodeId")
  const round = roundField(data)
  const base = { ...state, lastSeq: Math.max(state.lastSeq, event.seq) }

  switch (event.type) {
    case "run.start":
      return { ...createRunGraphState(), status: "running", lastSeq: event.seq }
    case "run.resume":
      return { ...base, status: "running" }
    case "step.start":
      return nodeId ? withStep(base, nodeId, "running", round) : base
    case "step.skip":
      return nodeId ? withStep(base, nodeId, "skipped", round) : base
    case "step.end":
      return nodeId ? withStep(base, nodeId, "completed", round) : base
    case "step.error": {
      if (!nodeId) return base
      const issue = issueField(data)
      const status = issue?.code === CANCELLED_CODE ? "cancelled" : "failed"
      return withStep(base, nodeId, status, round, issue?.message)
    }
    case "branch.select": {
      if (!nodeId) return base
      const arm = typeof data.arm === "number" ? data.arm : null
      return { ...base, arms: { ...base.arms, [nodeId]: arm } }
    }
    case "loop.round":
      if (!nodeId || round === undefined) return base
      return { ...base, loops: { ...base.loops, [nodeId]: { round, exhausted: false } } }
    case "loop.exhausted": {
      if (!nodeId) return base
      const rounds = typeof data.rounds === "number" ? data.rounds : 0
      const current = base.loops[nodeId]
      return {
        ...base,
        loops: {
          ...base.loops,
          [nodeId]: { round: current?.round ?? Math.max(0, rounds - 1), exhausted: true },
        },
      }
    }
    case "forEach.start":
    case "forEach.item.start":
    case "forEach.item.end":
    case "forEach.item.error":
    case "forEach.end":
      return base
    case "run.interrupted":
      return { ...base, status: "interrupted", steps: cancelRunning(base.steps) }
    case "run.end": {
      const outcome = outcomeFromStatus(stringField(data, "status"))
      return { ...base, status: outcome, steps: cancelRunning(base.steps) }
    }
    default:
      return base
  }
}

/**
 * Fold a list of run events (in `seq` order) into a graph run state, for replaying a
 * past run.
 * @category App
 */
export function replayRunEvents(events: readonly RunEvent[]): RunGraphState {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .reduce((state, event) => reduceRunEvent(state, event), createRunGraphState())
}

/**
 * Run-time state of a route edge: `taken` / `skipped` for branch arms once the branch
 * selected, `taken` for a loop that ran a round, else `idle`.
 * @category App
 */
export function armRunState(
  route: Pick<ReactFlowRouteEdgeData, "route" | "structureId" | "armIndex">,
  state: RunGraphState,
): ReactFlowArmRunState {
  if (route.route === "branch") {
    if (!(route.structureId in state.arms)) return "idle"
    return state.arms[route.structureId] === route.armIndex ? "taken" : "skipped"
  }
  if (route.route === "loop") return route.structureId in state.loops ? "taken" : "idle"
  return "idle"
}

/**
 * Map one run event onto the progress bus. `runId` is passed through on reset and done
 * (run events do not carry it).
 * @category App
 */
export function applyRunEvent(bus: ReactFlowRunProgress, event: RunEvent, runId?: string): void {
  const data = event.data ?? {}
  const nodeId = stringField(data, "nodeId")
  const round = roundField(data)
  const lifecycle = runId ? { runId } : {}
  const roundExtra = round !== undefined ? { round } : {}

  switch (event.type) {
    case "run.start":
      bus.emitReset(lifecycle)
      return
    case "step.start":
      if (nodeId) bus.emitStepStatus(nodeId, "running", roundExtra)
      return
    case "step.skip":
      if (nodeId) bus.emitStepStatus(nodeId, "skipped", roundExtra)
      return
    case "step.end":
      if (nodeId) bus.emitStepStatus(nodeId, "completed", roundExtra)
      return
    case "step.error": {
      if (!nodeId) return
      const issue = issueField(data)
      const status = issue?.code === CANCELLED_CODE ? "cancelled" : "failed"
      bus.emitStepStatus(nodeId, status, {
        ...roundExtra,
        ...(issue?.message ? { message: issue.message } : {}),
      })
      return
    }
    case "branch.select":
      if (nodeId) bus.emitArmStatus(nodeId, typeof data.arm === "number" ? data.arm : null)
      return
    case "loop.round":
      if (nodeId && round !== undefined) bus.emitLoopRound(nodeId, round)
      return
    case "loop.exhausted":
      if (nodeId) {
        const rounds = typeof data.rounds === "number" ? data.rounds : 0
        bus.emitLoopRound(nodeId, Math.max(0, rounds - 1), true)
      }
      return
  case "forEach.start":
  case "forEach.item.start":
  case "forEach.item.end":
  case "forEach.item.error":
  case "forEach.end":
    return
    case "run.interrupted":
      bus.emitDone({ ...lifecycle, outcome: "interrupted" })
      return
    case "run.end":
      bus.emitDone({ ...lifecycle, outcome: outcomeFromStatus(stringField(data, "status")) })
      return
    default:
      return
  }
}
