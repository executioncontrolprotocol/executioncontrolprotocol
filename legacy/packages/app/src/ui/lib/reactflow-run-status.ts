import type {
  ReactFlowArmRunState,
  ReactFlowStepStatus,
} from "../../graph/index.js"

/** Map of step id → run status. */
export type StepStatusMap = Record<string, ReactFlowStepStatus>

/**
 * Reset all known step ids to pending when a run starts.
 * @category Demo
 */
export function resetStepStatuses(stepIds: string[]): StepStatusMap {
  const next: StepStatusMap = {}
  for (const id of stepIds) {
    next[id] = "pending"
  }
  return next
}

/**
 * Apply a single step status update.
 * @category Demo
 */
export function applyStepStatus(
  current: StepStatusMap,
  stepId: string,
  status: ReactFlowStepStatus
): StepStatusMap {
  return { ...current, [stepId]: status }
}

/**
 * Mark every still-pending step as skipped (after `run.end`).
 * Optionally restrict to `onlyIds` so I/O projection nodes stay untouched.
 * @category Demo
 */
export function markPendingAsSkipped(
  current: StepStatusMap,
  onlyIds?: readonly string[]
): StepStatusMap {
  const allow = onlyIds ? new Set(onlyIds) : undefined
  let changed = false
  const next: StepStatusMap = { ...current }
  for (const [id, status] of Object.entries(current)) {
    if (status !== "pending") continue
    if (allow && !allow.has(id)) continue
    next[id] = "skipped"
    changed = true
  }
  return changed ? next : current
}

/**
 * Derive edge visual status from endpoint step statuses.
 * Idle = solid blue; incomplete = in-flight ants; completed = source step done.
 * Skipped endpoints stay muted (no ants).
 * @category Demo
 */
export function edgeRunStatus(
  sourceStatus: ReactFlowStepStatus | undefined,
  targetStatus: ReactFlowStepStatus | undefined,
  runActive: boolean
): "idle" | "incomplete" | "completed" | "failed" {
  if (sourceStatus === "failed" || targetStatus === "failed") return "failed"
  if (sourceStatus === "skipped" || targetStatus === "skipped") return "idle"
  if (sourceStatus === "completed") return "completed"
  if (runActive && (sourceStatus === "pending" || sourceStatus === "running")) {
    return "incomplete"
  }
  return "idle"
}

/**
 * CSS class for a step node border during/after a run.
 * @category Demo
 */
export function stepNodeStatusClass(
  status: ReactFlowStepStatus | undefined,
  runActive: boolean
): string {
  if (status === "completed") return "ecp-rf-node--completed"
  if (status === "failed") return "ecp-rf-node--failed"
  if (status === "running") return "ecp-rf-node--running"
  if (status === "skipped") return "ecp-rf-node--skipped"
  if (runActive && status === "pending") return "ecp-rf-node--pending"
  return ""
}

/**
 * CSS class for an edge during/after a run.
 * @category Demo
 */
export function edgeStatusClass(
  sourceStatus: ReactFlowStepStatus | undefined,
  targetStatus: ReactFlowStepStatus | undefined,
  runActive: boolean
): string {
  const kind = edgeRunStatus(sourceStatus, targetStatus, runActive)
  if (kind === "failed") return "ecp-rf-edge--failed"
  if (kind === "completed") return "ecp-rf-edge--completed"
  if (kind === "incomplete") return "ecp-rf-edge--incomplete"
  return "ecp-rf-edge--idle"
}

/**
 * Taken / skipped / idle for a branch arm from its child step statuses.
 * @category Demo
 */
export function armRunState(
  stepIds: readonly string[] | undefined,
  statuses: StepStatusMap
): ReactFlowArmRunState {
  if (!stepIds || stepIds.length === 0) return "idle"
  const child = stepIds.map((id) => statuses[id])
  if (child.some((s) => s === "completed" || s === "running" || s === "failed")) {
    return "taken"
  }
  if (child.every((s) => s === "skipped")) return "skipped"
  return "idle"
}
