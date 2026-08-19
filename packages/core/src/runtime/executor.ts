import type { RunResult, StepRunRecord, WorkflowManifest } from "@executioncontrolprotocol/types"
import type { RemoteInvokeBinding } from "./remote-invoke.js"
import type { CapabilityBlobStore } from "./blobs.js"

/** Runtime execution mode. @category Runtime */
export type RuntimeExecutionMode = "run" | "test"

/** Runtime execution options passed to the executor. @category Runtime */
export interface RuntimeExecutionContext {
  runId: string
  input: Record<string, unknown>
  registry: import("../registry/registry.js").Registry
  bindings: import("../environment/bindings.js").ResolvedBindings
  /** Optional cancellation signal (browser/Node). */
  signal?: AbortSignal
  /** Max parallel branches (runtime config may override). */
  maxConcurrency?: number
  /** Execution mode (default `"run"`). */
  mode?: RuntimeExecutionMode
  /** Seed state for test sessions (replaces input-only seed when set). */
  seedState?: Record<string, unknown>
  /** Seed step history for test sessions. */
  seedHistory?: Record<string, StepRunRecord>
  /** Inclusive stop after this leaf step id (test `runTo`). */
  stopAfterStepId?: string
  /** Execute only this leaf step id (test `rerun`). */
  onlyStepId?: string
  /** Local invoke host for host/mixed hops. */
  remoteInvoke?: RemoteInvokeBinding
  /** Run-scoped browser file map. */
  blobs?: CapabilityBlobStore
}

/** Runtime executor interface. @category Runtime */
export interface RuntimeExecutor {
  execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult>
}
