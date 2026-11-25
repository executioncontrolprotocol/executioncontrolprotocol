import type { ExecutionManifest } from "./manifest.js"
import type { ValidationIssue, ValidationResult } from "./validation.js"
import type { RunStatus, StepStatus } from "./objects.js"

/**
 * Success or refusal of an operation. A failed run is still `ok: true`.
 * @category Operations
 */
export type OperationResponse<T> = { ok: true; data: T } | { ok: false; error: OperationError }

/**
 * Refusal of an operation. The operation did not do the work.
 * @category Operations
 */
export interface OperationError {
  /** Catalogue code. */
  code: string
  /** One sentence. */
  message: string
  /** JSON Pointer, when the error is about one location. */
  path?: string
  /** Concrete fixes. */
  suggestions?: string[]
  /** Validation issues, when the manifest or input was rejected. */
  issues?: ValidationIssue[]
  /** Present for `ECP_HOST_RESTARTING`. */
  retryAfterMs?: number
}

/**
 * Object kinds `retrieve` can read.
 * @category Operations
 */
export type RetrieveType = "capability" | "execution" | "config" | "run" | "plugin" | "formatter" | "schema"

/**
 * Input of `retrieve`. `id` and `query` are mutually exclusive.
 * @category Operations
 */
export interface RetrieveInput {
  /** What to read. */
  type: RetrieveType
  /** Exactly one item, full detail. */
  id?: string
  /** Absolute path to an execution file on path-capable hosts. */
  path?: string
  /** Case-insensitive search. Capabilities, executions and configs only. */
  query?: string
  /** List filters. */
  filter?: {
    /** Plugin id or short name. */
    plugin?: string
    /** Execution id, for runs. */
    executionId?: string
    /** Run status. */
    status?: RunStatus
    /** Client request id. */
    clientRequestId?: string
    /** List `*.ecp.json` under this directory (execution list only). */
    dir?: string
  }
  /** Extra sections for a run or execution. */
  include?: Array<"steps" | "events" | "manifest" | "state" | "document" | "scripts">
  /** Maximum items. Default 10, max 100. */
  limit?: number
  /** Formatter id. Default JSON. */
  format?: string
  /** Write the full result here and respond with a summary. */
  output?: { path: string }
}

/**
 * `retrieve` payload before formatting.
 * @category Operations
 */
export type RetrieveData =
  | { type: RetrieveType; item: unknown }
  | { type: RetrieveType; items: unknown[]; total: number }
  | { type: RetrieveType; format: string; text: string }
  | { type: RetrieveType; written: { path: string; bytes: number }; summary: string }

/**
 * How `execute` should treat the execution.
 * @category Operations
 */
export type ExecuteMode = "run" | "validate"

/**
 * One JSON Patch operation. Paths may contain a single `@<nodeId>` segment
 * immediately under `/steps`.
 * @category Operations
 */
export interface PatchOp {
  /** Patch operation. */
  op: "add" | "remove" | "replace" | "move" | "copy" | "test"
  /** JSON Pointer, with the `@nodeId` extension. */
  path: string
  /** Source pointer for `move` and `copy`. */
  from?: string
  /** Value for `add`, `replace` and `test`. */
  value?: unknown
}

/**
 * Where `execute` loads the manifest from.
 * @category Operations
 */
export type ExecuteExecution =
  | ExecutionManifest
  | { id: string }
  | { path: string }
  | { id: string; patch: PatchOp[] }

/**
 * Input of `execute`. Exactly one of `execution`, `resume`, `cancel`.
 * @category Operations
 */
export interface ExecuteInput {
  /** Manifest, stored id, file path, or stored id plus an unsaved patch. */
  execution?: ExecuteExecution
  /** Run input, validated against `execution.accepts`. */
  input?: Record<string, unknown>
  /** Default `run`. `validate` does not start a run. */
  mode?: ExecuteMode
  /** Wait for the run to finish. Default true. */
  wait?: boolean
  /** How long to wait. Default 120000 for MCP and HTTP. Unlimited for the CLI. */
  waitTimeoutMs?: number
  /** Write the full result here and respond with a summary. */
  output?: { path: string }
  /** Idempotency key set by the relay or CLI. */
  clientRequestId?: string
  /** Resume this run id. */
  resume?: string
  /** Cancel this run id. */
  cancel?: string
}

/**
 * One step line in an execute response.
 * @category Operations
 */
export interface ExecuteStepSummary {
  /** Node id. */
  nodeId: string
  /** Loop round, when the step ran inside a loop. */
  round?: number
  /** Step status. */
  status: StepStatus
  /** Wall time in milliseconds. */
  durationMs?: number
}

/**
 * `execute` payload.
 * @category Operations
 */
export type ExecuteData =
  | { validation: ValidationResult }
  | {
      runId: string
      status: RunStatus
      validation: ValidationResult
      result?: Record<string, unknown>
      error?: ValidationIssue
      steps: ExecuteStepSummary[]
      warnings?: ValidationIssue[]
    }

/**
 * Object kinds `commit` can write. Other retrieve kinds are read-only.
 * @category Operations
 */
export type CommitType = "execution" | "config"

/**
 * Create, replace or delete.
 * @category Operations
 */
export type CommitAction = "create" | "update" | "delete"

/**
 * Input of `commit`.
 * @category Operations
 */
export interface CommitInput {
  /** Execution or config. */
  type: CommitType
  /** What to do. */
  action: CommitAction
  /** Required for update and delete. For create, taken from the object when absent. */
  id?: string
  /** Full object for create, or a full replacement for update. */
  object?: unknown
  /** JSON Patch for update. Mutually exclusive with `object`. */
  patch?: PatchOp[]
  /** Required for update and delete. Integer for stored ids; opaque string for paths. */
  ifVersion?: number | string
  /** Absolute path to an execution file on path-capable hosts (update/delete only). */
  path?: string
  /** Store despite L2/L3 validation errors when L1 passes (execution create/update only). */
  draft?: boolean
  /** Relative script paths to write beside the execution (execution create/update only). */
  scripts?: Record<string, string>
}

/**
 * Single execution from `retrieve` by id or path.
 * @category Operations
 */
export interface ExecutionItem {
  /** Stored execution id. */
  id?: string
  /** File path when addressed by path. */
  path?: string
  /** Numeric version for stored ids; opaque string for paths. */
  version: number | string
  /** Parsed manifest. */
  manifest: ExecutionManifest
  /** Current L0–L3 validation (errors and warnings). */
  issues: ValidationIssue[]
  /** Warning-severity issues from validation or stored meta. */
  warnings: ValidationIssue[]
  /** Last update time (ISO-8601). */
  updatedAt: string
  /** Referenced `$script.path` file contents when `include` contains `scripts`. */
  scripts?: Record<string, string>
}

/**
 * `commit` payload. `version` is null after delete.
 * @category Operations
 */
export interface CommitData {
  /** Object kind. */
  type: CommitType
  /** Object id when stored by id. */
  id?: string
  /** New version, or null after delete. */
  version: number | string | null
  /** Warnings stored with the object. */
  warnings?: ValidationIssue[]
  /** Validation issues when `draft: true` was used. */
  issues?: ValidationIssue[]
}
