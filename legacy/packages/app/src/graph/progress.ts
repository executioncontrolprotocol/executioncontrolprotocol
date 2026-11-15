import type {
  ReactFlowRunLifecycleDetail,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"

/** Progress event names. @category App */
export type ReactFlowProgressEventName = "run:reset" | "step:status" | "run:done"

/**
 * Browser-safe progress bus for React Flow run visualization.
 * Listeners receive CustomEvent with typed detail.
 * @category App
 */
export class ReactFlowRunProgress extends EventTarget {
  /** Emit run reset (all steps pending). */
  emitReset(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:reset", { detail }))
  }

  /** Emit a step status change. */
  emitStepStatus(stepId: string, status: ReactFlowStepStatus, message?: string): void {
    const detail: ReactFlowStepStatusDetail = { stepId, status, ...(message ? { message } : {}) }
    this.dispatchEvent(new CustomEvent("step:status", { detail }))
  }

  /** Emit run completion. */
  emitDone(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:done", { detail }))
  }
}

/**
 * Shared progress bus. The format-reactflow extension used 9 lifecycle hooks
 * that forwarded onto this bus (plus these 3 emit helpers).
 * @category App
 */
export const reactFlowRunProgress = new ReactFlowRunProgress()
