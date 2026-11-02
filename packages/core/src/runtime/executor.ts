import type {
  PublicRunEvent,
  RunApproval,
  RunJournalMeta,
  RunResult,
  StepRunRecord,
  WorkflowManifest,
} from "../types/index.js"
import type { RemoteInvokeBinding } from "./remote-invoke.js"
import type { CapabilityArtifactStore } from "./artifacts.js"
import type { CapabilityBlobStore } from "./blobs.js"
import type { ServiceMap } from "../services/map.js"

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
  /** Seed state for resume/rerun (replaces input-only seed when set). */
  seedState?: Record<string, unknown>
  /** Seed step history for resume/rerun. */
  seedHistory?: Record<string, StepRunRecord>
  /** Inclusive stop after this leaf step id (`ecp run --to`). */
  stopAfterStepId?: string
  /** Execute only this leaf step id (`ecp runs rerun --from X --to X`). */
  onlyStepId?: string
  /** Recorded approvals for `plugin-approval`. */
  approvals?: RunApproval[]
  /** Host journal metadata (path, hash, parent run). */
  journal?: RunJournalMeta
  /** Public NDJSON stream (`ecp run --events`). May return a promise so hosts can flush. */
  onEvent?: (event: PublicRunEvent) => void | Promise<void>
  /** Local invoke host for host/mixed hops. */
  remoteInvoke?: RemoteInvokeBinding
  /** Run-scoped browser file map. */
  blobs?: CapabilityBlobStore
  /** Environment-scoped host artifact map. */
  artifacts?: CapabilityArtifactStore
  /** Host services bound with {@link Environment.use}. */
  services?: ServiceMap
}

/** Runtime executor interface. @category Runtime */
export interface RuntimeExecutor {
  execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult>
}
