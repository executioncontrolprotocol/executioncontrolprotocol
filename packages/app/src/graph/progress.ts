import type {
  ReactFlowArmStatusDetail,
  ReactFlowLoopRoundDetail,
  ReactFlowRunLifecycleDetail,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"

/**
 * Progress event names on {@link ReactFlowRunProgress}.
 * @category App
 */
export type ReactFlowProgressEventName =
  | "run:reset"
  | "step:status"
  | "arm:status"
  | "loop:round"
  | "run:done"

/**
 * Browser-safe progress bus for run visualization on the graph.
 * Listeners receive a `CustomEvent` whose `detail` is typed per event name.
 * @category App
 */
export class ReactFlowRunProgress extends EventTarget {
  /** Emit a run reset (every step back to pending). */
  emitReset(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:reset", { detail }))
  }

  /** Emit a step status change. */
  emitStepStatus(
    stepId: string,
    status: ReactFlowStepStatus,
    extra: { message?: string; round?: number } = {},
  ): void {
    const detail: ReactFlowStepStatusDetail = {
      stepId,
      status,
      ...(extra.round !== undefined ? { round: extra.round } : {}),
      ...(extra.message ? { message: extra.message } : {}),
    }
    this.dispatchEvent(new CustomEvent("step:status", { detail }))
  }

  /** Emit the arm a branch selected (`null` when no arm ran). */
  emitArmStatus(structureId: string, arm: number | null): void {
    const detail: ReactFlowArmStatusDetail = { structureId, arm }
    this.dispatchEvent(new CustomEvent("arm:status", { detail }))
  }

  /** Emit a loop round start, or the loop stopping at `maxRounds`. */
  emitLoopRound(structureId: string, round: number, exhausted = false): void {
    const detail: ReactFlowLoopRoundDetail = {
      structureId,
      round,
      ...(exhausted ? { exhausted: true } : {}),
    }
    this.dispatchEvent(new CustomEvent("loop:round", { detail }))
  }

  /** Emit run completion or interruption. */
  emitDone(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:done", { detail }))
  }
}

/**
 * Shared progress bus for the App.
 * @category App
 */
export const reactFlowRunProgress = new ReactFlowRunProgress()
