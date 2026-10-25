import type {
  EnvironmentDescriptor,
  PublicRunEvent,
  RequirementsDocument,
  RunStatus,
  SearchResultItem,
  StepRunRecord,
  ValidationIssue,
  ValidationResult,
  WorkflowManifest,
} from "@executioncontrolprotocol/core/types"
import type { RoundTripResult } from "./round-trip.js"

/**
 * `GET /api/source` body.
 * @category App
 */
export interface AppSourceResponse {
  /** Workflow file path. */
  path: string
  /** Fluent source. */
  source: string
  /** Compiled manifest when load succeeded. */
  manifest?: WorkflowManifest
  /** Requirements when load succeeded. */
  requirements?: RequirementsDocument
  /** Round-trip status for `source`. */
  roundTrip: RoundTripResult
  /** Present when the file failed to load (`ECP_WORKFLOW_LOAD`). */
  loadError?: ValidationResult
}

/**
 * `PUT /api/source` body.
 * @category App
 */
export interface AppSourceWrite {
  /** Fluent source to write. */
  source: string
}

/**
 * `POST /api/run` body.
 * @category App
 */
export interface AppRunRequest {
  /** Fluent source to run. */
  source: string
  /** Workflow input. */
  input?: unknown
}

/**
 * `POST /api/run` success body.
 * @category App
 */
export interface AppRunResponse {
  /** Journal run id (same as `ecp run`). */
  runId: string
  /** Terminal run status. */
  status: RunStatus
  /** Public `returns` output when the workflow declares it. */
  output?: Record<string, unknown>
  /** Run-level diagnostics. */
  diagnostics?: ValidationIssue[]
  /** Per-step history. */
  history?: Record<string, StepRunRecord>
}

/**
 * One WebSocket `/api/events` message.
 * @category App
 */
export type AppEventMessage =
  | { type: "file"; source: string; manifest?: WorkflowManifest; loadError?: ValidationResult; roundTrip?: RoundTripResult }
  | { type: "run"; event: PublicRunEvent }

/**
 * `GET /api/search` body.
 * @category App
 */
export interface AppSearchResponse {
  /** Hit rows. */
  results: SearchResultItem[]
}

/**
 * `GET /api/describe` returns {@link EnvironmentDescriptor}.
 * `POST /api/validate` returns {@link ValidationResult}.
 * @category App
 */
export type AppDescribeResponse = EnvironmentDescriptor
