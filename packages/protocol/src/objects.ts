import type { ExecutionManifest, JsonValue } from "./manifest.js"
import type { ArtifactFileRef, FileRef } from "./plugins.js"
import type { ValidationIssue } from "./validation.js"

/**
 * Run status stored on the run record.
 * @category Definitions
 */
export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

/**
 * Status of one step record.
 * @category Definitions
 */
export type StepStatus = "completed" | "failed" | "skipped" | "cancelled"

/**
 * Where a run is in the graph, used to resume.
 * @category Definitions
 */
export interface RunCursor {
  /** Node ids that finished. */
  completed: string[]
  /** Node currently executing, if the run stopped mid-node. */
  inProgress?: string
  /** Loop id to the round index that was in progress. */
  loops: Record<string, number>
  /** `if` node id to the side that was taken. */
  choices: Record<string, "then" | "else">
  /** Outermost `forEach` loop id to item indexes that finished. */
  loopItems?: Record<string, { completed: number[] }>
}

/**
 * Partial per-item results for an outer `forEach` loop (`runs/<runId>/loop-items/<nodeId>.json`).
 * @category Definitions
 */
export interface LoopPartialFile {
  /** Item index (string key) to collected value, or `null` when continuing past an error. */
  results: Record<string, JsonValue | null>
  /** Failed item indexes when `onError` is `continue`. */
  errors: Array<{ index: number; error: ValidationIssue }>
}

/**
 * Saved execution metadata beside the manifest.
 * @category Definitions
 */
export interface StoredExecutionMeta {
  /** Execution id. */
  id: string
  /** Monotonic version, starting at 1. */
  version: number
  /** Canonical manifest hash. */
  manifestHash: string
  /** ISO-8601 creation time. */
  createdAt: string
  /** ISO-8601 update time. */
  updatedAt: string
  /** Warnings stored with the commit. */
  warnings: ValidationIssue[]
}

/**
 * An execution as `retrieve` returns it.
 * @category Definitions
 */
export interface StoredExecution extends StoredExecutionMeta {
  /** Manifest with `execution.id` set to the stored id. */
  manifest: ExecutionManifest
}

/**
 * Row in an execution list.
 * @category Definitions
 */
export interface StoredExecutionSummary {
  /** Execution id. */
  id: string
  /** Monotonic version. */
  version: number
  /** Optional label from the manifest. */
  label?: string
  /** ISO-8601 update time. */
  updatedAt: string
}

/**
 * Secret or env reference allowed inside config `values`, never in an execution.
 * @category Definitions
 */
export interface SecretRef {
  /** Secret key. */
  $secret: string
}

/**
 * Environment-variable reference allowed inside config `values`.
 * @category Definitions
 */
export interface EnvRef {
  /** Environment variable name. */
  $env: string
}

/**
 * Config object. `id` is `<plugin-short>/<name>`.
 * @category Definitions
 */
export interface ConfigObject {
  /** Always `@executioncontrolprotocol.config`. */
  schema: "@executioncontrolprotocol.config"
  /** Always `1.0`. */
  version: "1.0"
  /** `<plugin-short>/<name>`. */
  id: string
  /** Plugin id the config belongs to. */
  plugin: string
  /** Values. `$secret` and `$env` objects stand in for strings. */
  values: Record<string, JsonValue | SecretRef | EnvRef>
  /** Monotonic version. */
  objectVersion: number
  /** ISO-8601 update time. */
  updatedAt: string
}

/**
 * Identity of the execution a run was started from.
 * @category Definitions
 */
export interface RunExecutionRef {
  /** Execution id, when the run was started from a stored execution. */
  id?: string
  /** Absolute path, when the run was started from a file. */
  path: string | null
  /** Canonical manifest hash. */
  manifestHash: string
  /** Stored execution version, when started from storage. */
  executionVersion?: number
}

/**
 * How the host ran the execution (`server` HTTP child or `in-process`).
 * @category Definitions
 */
export type RunHostMode = "in-process" | "server"

/**
 * Host identity recorded on a run.
 * @category Definitions
 */
export interface RunHostInfo {
  /** Host package version. */
  version: string
  /** Host process id (never 0 on new runs). */
  pid: number
  /** `server` or `in-process`. */
  mode: RunHostMode
}

/**
 * Metadata describing how a capability publishes or unpublishes a file.
 * @category Definitions
 */
export interface CapabilityPublishMetadata {
  /** Input/output field that carries the source {@link FileRef} on publish. Default `file`. */
  fileField?: string
  /** Output/input fields that identify the remote object for matching entries. */
  locatorFields: string[]
}

/**
 * Publisher role on a capability manifest.
 * @category Definitions
 */
export type CapabilityRole = "publish" | "unpublish"

/**
 * One publish tracked on the run record after a successful publish step.
 * @category Definitions
 */
export interface PublishRecord {
  /** Step that published the file. */
  stepId: string
  /** Loop round when the step ran inside a loop. */
  round: number | null
  /** Capability id that performed the publish. */
  capabilityId: string
  /** ISO-8601 timestamp when the publish was recorded. */
  at: string
  /** Source ref sent to the publisher (headers stripped). */
  source: FileRef
  /** Fetchable URL returned by the publisher (`file.url`); query kept for later steps. */
  url: string
  /** Locator values (for example blob name and container). */
  locator: Record<string, string>
  /** ISO-8601 when an unpublish step matched this entry. */
  deletedAt?: string
  /** Step id of the matching unpublish. */
  deleteStepId?: string
}

/**
 * Persisted run record (`run.json`).
 * @category Definitions
 */
export interface RunRecord {
  /** Always `@executioncontrolprotocol.run`. */
  schema: "@executioncontrolprotocol.run"
  /** Always `1.0`. */
  version: "1.0"
  /** `run-<UTC yyyymmddTHHMMSSZ>-<6 hex>`. */
  id: string
  /** Which execution ran. */
  execution: RunExecutionRef
  /** Current status. */
  status: RunStatus
  /** Redacted run input. */
  input: Record<string, unknown>
  /** Redacted result. Null until the run ends with a result. */
  result: Record<string, unknown> | null
  /** Failure issue, when `status` is `failed`. */
  error: ValidationIssue | null
  /** ISO-8601 start. */
  startedAt: string
  /** ISO-8601 end, once the run leaves `running`. */
  endedAt?: string
  /** Wall time in milliseconds, once known. */
  durationMs?: number
  /** Plugin id to version, for plugins the run loaded. */
  plugins: Record<string, string>
  /** Host that ran it. */
  host: RunHostInfo
  /** Caller-supplied idempotency key. */
  clientRequestId?: string
  /** Resume cursor. */
  cursor?: RunCursor
  /** Warnings collected during the run. */
  warnings: ValidationIssue[]
  /** Files published during the run (publish steps append; unpublish steps mark `deletedAt`). */
  publishes: PublishRecord[]
  /** Per-phase timing when captured. */
  timing?: Record<string, number>
}

/**
 * One staged write preview stored on a step record.
 * @category Definitions
 */
export interface StagedWritePreview {
  /** Store operation. */
  op: "set" | "merge" | "append"
  /** State path. */
  path: string
  /** Short preview of the value. Secrets are redacted. */
  valuePreview: string
}

/**
 * Original file ref recorded on a captured output entry.
 * @category Definitions
 */
export interface CapturedFileSource {
  /** Source ref kind (unchanged after capture). */
  kind: "file" | "url" | "artifact"
  /** Url source with query stripped, when `kind` is `url`. */
  url?: string
  /** Path source, when `kind` is `file`. */
  path?: string
  /** Artifact uri, when `kind` is `artifact`. */
  uri?: string
}

/**
 * One captured {@link FileRef} from a successful step output.
 * @category Definitions
 */
export interface CapturedFileRecord {
  /** JSON pointer to the ref in the step output. */
  path: string
  /** Source ref at capture time. */
  source: CapturedFileSource
  /** Stored artifact, when capture succeeded. */
  artifact?: ArtifactFileRef
  /** Failure, when capture did not store a copy. */
  error?: { code: string; message: string }
}

/**
 * Persisted step record.
 * @category Definitions
 */
export interface StepRecord {
  /** Node id. */
  nodeId: string
  /** Loop round, or null outside a loop. */
  round: number | null
  /** `forEach` item indexes, outermost first; absent outside a `forEach` loop. */
  items?: number[]
  /** Capability id. */
  capabilityId: string
  /** Step status. */
  status: StepStatus
  /** Redacted resolved input. */
  input: unknown
  /** Redacted output. */
  output: unknown
  /** Failure issue, when `status` is `failed`. */
  error: ValidationIssue | null
  /** Config used, when the step had one. */
  config?: { id: string; version: number }
  /** ISO-8601 start. */
  startedAt: string
  /** ISO-8601 end. */
  endedAt?: string
  /** Wall time in milliseconds. */
  durationMs?: number
  /** Transform script source that ran, when the step used `code: "script"`. */
  script?: string
  /** Transform expression that ran, when the step used `code: "expression"`. */
  expression?: string
  /** Staged writes applied because the step succeeded. */
  staged?: StagedWritePreview[]
  /** Declared vs sniffed media types corrected during the step. */
  mediaTypes?: Array<{ path: string; declared?: string; sniffed: string }>
  /** Files captured from step output (uniform capture). */
  captured?: CapturedFileRecord[]
}

/**
 * One line of `events.ndjson`.
 * @category Definitions
 */
export interface RunEvent {
  /** Monotonic sequence, starting at 1. */
  seq: number
  /** ISO-8601 time. */
  at: string
  /** Event type. */
  type: RunEventType
  /** Event payload. Shape depends on `type`. */
  data: Record<string, unknown>
}

/**
 * Event types the executor emits.
 * @category Definitions
 */
export type RunEventType =
  | "run.start"
  | "step.start"
  | "step.skip"
  | "step.end"
  | "step.error"
  | "step.warning"
  | "if.select"
  | "loop.repeat"
  | "loop.round"
  | "loop.exhausted"
  | "loop.start"
  | "loop.item.start"
  | "loop.item.end"
  | "loop.item.error"
  | "loop.end"
  | "run.interrupted"
  | "run.resume"
  | "run.end"

/**
 * Run record plus the optional detail sections `retrieve` can include.
 * @category Definitions
 */
export interface RunDetail extends RunRecord {
  /** Step records, when requested. */
  steps?: StepRecord[]
  /** Events in `seq` order, when requested. */
  events?: RunEvent[]
  /** Latest state, when requested. */
  state?: Record<string, unknown>
  /** Manifest copy, when requested. */
  manifest?: ExecutionManifest
}

/**
 * Filter for listing runs.
 * @category Definitions
 */
export interface RunFilter {
  /** Restrict to one execution id. */
  executionId?: string
  /** Restrict to one status. */
  status?: RunStatus
  /** Restrict to one client request id. */
  clientRequestId?: string
}

/**
 * Notification from {@link StorageProvider.watch}.
 * @category Definitions
 */
export interface StorageChange {
  /** Which collection changed. */
  type: "execution" | "config" | "run"
  /** Object id. */
  id: string
  /** What happened. */
  action: "put" | "delete"
}

/**
 * Capability row returned by `retrieve`.
 * @category Definitions
 */
export interface CapabilityEntry {
  /** Capability id. */
  id: string
  /** Plugin id. */
  plugin: string
  /** npm package name. */
  package: string
  /** Plugin version from the manifest. */
  pluginVersion: string
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description: string
  /** When to call it. */
  useCases: string[]
  /** What to take from the output. */
  projections: string[]
  /**
   * JSON Schema for the input. Present on full entries (`retrieve --id`, validation);
   * omitted from light listing / query hits.
   */
  accepts?: Record<string, unknown>
  /**
   * JSON Schema for the output. Present on full entries (`retrieve --id`, validation);
   * omitted from light listing / query hits.
   */
  returns?: Record<string, unknown>
  /** Plugin config schema, when the plugin has one. */
  configSchema?: Record<string, unknown>
  /** Step timeout in milliseconds. */
  timeoutMs?: number
  /**
   * `"step"` when the step declares `accepts` / `returns`; omitted means the capability schema is the contract.
   */
  contract?: "step"
  /** How the host runs the step when {@link CapabilityEntry.contract} is `"step"`. */
  code?: "script" | "expression"
  /** Publisher role, when the capability uploads or deletes remote file storage. */
  role?: CapabilityRole
  /** How to record publish entries; required when {@link CapabilityEntry.role} is set. */
  publish?: CapabilityPublishMetadata
}

/**
 * Search hit for a capability. Full entries are returned only for `id`.
 * @category Definitions
 */
export interface CapabilitySummary {
  /** Capability id. */
  id: string
  /** Plugin id. */
  plugin: string
  /** One-line summary. */
  summary: string
}
