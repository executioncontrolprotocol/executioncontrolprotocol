import type { PublicRunEvent } from "@executioncontrolprotocol/core/types"
import type { ReactFlowRunProgress } from "./progress.js"

/**
 * Map a public `ecp run --events` record onto the React Flow progress bus.
 * @category App
 */
export function applyPublicRunEvent(
  bus: ReactFlowRunProgress,
  event: PublicRunEvent
): void {
  if (event.type === "run.start") {
    bus.emitReset({ runId: event.runId })
    return
  }
  if (event.type === "step.start" && event.stepId) {
    bus.emitStepStatus(event.stepId, "running")
    return
  }
  if (event.type === "step.end" && event.stepId) {
    bus.emitStepStatus(event.stepId, event.status === "failed" ? "failed" : "completed")
    return
  }
  if (event.type === "step.error" && event.stepId) {
    bus.emitStepStatus(event.stepId, "failed", event.error?.message)
    return
  }
  if (event.type === "run.end") {
    const outcome =
      event.status === "failed"
        ? "failed"
        : event.status === "cancelled"
          ? "cancelled"
          : "completed"
    bus.emitDone({ runId: event.runId, outcome })
  }
}
