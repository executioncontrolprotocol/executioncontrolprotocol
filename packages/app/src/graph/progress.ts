import type {
  ReactFlowLoopProgressDetail,
  ReactFlowLoopRoundDetail,
  ReactFlowRunLifecycleDetail,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"

/**
 * Event names emitted on the graph run progress bus.
 * @category App
 */
export type ReactFlowProgressEventName =
  | "run:reset"
  | "run:done"
  | "step:status"
  | "if:choice"
  | "loop:round"
  | "loop:progress"

/**
 * Typed event target for graph run overlays during live or replayed runs.
 * @category App
 */
export class ReactFlowRunProgress extends EventTarget {
  private readonly loopItemsById = new Map<string, { count: number; done: number; failed?: number }>()

  /** Latest folded `forEach` loop progress for live bus updates. */
  currentLoopItems(structureId: string): { count: number; done: number; failed?: number } | undefined {
    return this.loopItemsById.get(structureId)
  }

  /** Clear all derived state (on `run.start`). */
  emitReset(detail?: ReactFlowRunLifecycleDetail): void {
    this.loopItemsById.clear()
    this.dispatchEvent(new CustomEvent("run:reset", { detail: detail ?? {} }))
  }

  /** Emit terminal run outcome. */
  emitDone(detail?: ReactFlowRunLifecycleDetail): void {
    this.dispatchEvent(new CustomEvent("run:done", { detail: detail ?? {} }))
  }

  /** Emit one step status change. */
  emitStepStatus(stepId: string, status: ReactFlowStepStatus, extra?: Omit<ReactFlowStepStatusDetail, "stepId" | "status">): void {
    const detail: ReactFlowStepStatusDetail = { stepId, status, ...extra }
    this.dispatchEvent(new CustomEvent("step:status", { detail }))
  }

  /** Emit `if` side selection. */
  emitIfChoice(ifId: string, side: "then" | "else" | null): void {
    this.dispatchEvent(new CustomEvent("if:choice", { detail: { ifId, side } }))
  }

  /** Emit loop round progress for `while` / `for` modes. */
  emitLoopRound(structureId: string, round: number, exhausted?: boolean): void {
    const detail: ReactFlowLoopRoundDetail = { structureId, round, ...(exhausted ? { exhausted } : {}) }
    this.dispatchEvent(new CustomEvent("loop:round", { detail }))
  }

  /** Emit item completion counts for a `forEach` loop structure node overlay. */
  emitLoopProgress(structureId: string, done: number, count: number, failed?: number): void {
    this.loopItemsById.set(structureId, { count, done, ...(failed !== undefined ? { failed } : {}) })
    const detail: ReactFlowLoopProgressDetail = {
      structureId,
      done,
      count,
      ...(failed !== undefined ? { failed } : {}),
    }
    this.dispatchEvent(new CustomEvent("loop:progress", { detail }))
  }
}

/** Shared singleton progress bus for the App shell. @category App */
export const reactFlowRunProgress = new ReactFlowRunProgress()