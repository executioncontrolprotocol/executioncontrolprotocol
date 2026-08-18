import type {
  ReactFlowRunLifecycleDetail,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"

/** Progress event names. @category Encoding */
export type ReactFlowProgressEventName = "run:reset" | "step:status" | "run:done"

/**
 * Browser-safe progress bus for React Flow run visualization.
 * Listeners receive CustomEvent with typed detail.
 * @category Encoding
 */
export class ReactFlowRunProgress extends EventTarget {
  /** Emit run reset (all steps pending). */
  emitReset(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:reset", { detail }))
  }

  /** Emit a step status change. */
  emitStepStatus(stepId: string, status: ReactFlowStepStatus): void {
    const detail: ReactFlowStepStatusDetail = { stepId, status }
    this.dispatchEvent(new CustomEvent("step:status", { detail }))
  }

  /** Emit run completion. */
  emitDone(detail: ReactFlowRunLifecycleDetail = {}): void {
    this.dispatchEvent(new CustomEvent("run:done", { detail }))
  }
}

/** Shared progress bus for the format-reactflow extension hooks. @category Encoding */
export const reactFlowRunProgress = new ReactFlowRunProgress()
