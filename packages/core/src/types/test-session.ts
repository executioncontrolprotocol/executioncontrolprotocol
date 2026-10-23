import type { EcpVersion } from "./version.js"
import type { StepRunRecord } from "./run.js"
import type { WorkflowManifest } from "./workflow.js"

/** Status of a workflow test session. @category Test */
export type TestSessionStatus = "idle" | "paused" | "completed" | "failed"

/**
 * Serializable snapshot of a workflow test session (run-to / rerun).
 * Distinct from `@executioncontrolprotocol/core/testing` capability stubs.
 * @category Test
 */
export interface TestSessionSnapshot {
  /** Result schema discriminator. */
  schema: "@executioncontrolprotocol.test.session"
  /** ECP version. */
  version: EcpVersion
  /** Session id. */
  sessionId: string
  /** Workflow under test. */
  workflow: WorkflowManifest
  /** Original run input (seed). */
  input: Record<string, unknown>
  /** Committed workflow state (frozen between operations). */
  state: Record<string, unknown>
  /** Per-step history. */
  history: Record<string, StepRunRecord>
  /**
   * Last step that completed successfully in test order
   * (inclusive runTo / last rerun).
   */
  cursor?: string
  /** Session status. */
  status: TestSessionStatus
}
