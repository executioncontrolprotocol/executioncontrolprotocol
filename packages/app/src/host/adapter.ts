import type {
  EnvironmentDescriptor,
  PublicRunEvent,
  RequirementsDocument,
  SearchResultItem,
  ValidationResult,
  WorkflowManifest,
} from "@executioncontrolprotocol/core/types"
import type { RoundTripResult } from "./round-trip.js"

/**
 * Result of {@link HostAdapter.load}.
 * @category App
 */
export interface HostLoadResult {
  /** Absolute or workspace-relative workflow file path. */
  path: string
  /** Fluent TypeScript source. */
  source: string
  /** Compiled portable manifest. */
  manifest: WorkflowManifest
  /** Workflow-file requirements (never mixed into the manifest). */
  requirements: RequirementsDocument
  /** Whether graph edits can be written back through the Fluent encoder. */
  roundTrip: RoundTripResult
}

/**
 * Payload pushed when the workflow file changes on disk.
 * @category App
 */
export interface HostWatchPayload {
  /** Updated Fluent source. */
  source: string
  /** Recompiled manifest when the file loads. */
  manifest?: WorkflowManifest
  /** Load diagnostics when the file fails to compile. */
  loadError?: ValidationResult
  /** Round-trip status for the new source. */
  roundTrip?: RoundTripResult
}

/**
 * The only I/O the App UI uses. One local adapter ships with `plugin-app`;
 * an in-page adapter is Later.
 * @category App
 */
export interface HostAdapter {
  /** Read the current workflow file. */
  load(): Promise<HostLoadResult>
  /** Write Fluent source back to the file. */
  save(source: string): Promise<void>
  /**
   * Subscribe to file changes. Returns an unsubscribe function.
   * A failed load sends diagnostics instead of a graph.
   */
  watch(onChange: (next: HostWatchPayload) => void): () => void
  /** Capability catalogue for the graph palette. */
  describe(): Promise<EnvironmentDescriptor>
  /**
   * Search capabilities. Returns hit rows (core's `SearchResult` is the envelope).
   */
  search(query: string): Promise<SearchResultItem[]>
  /** Validate Fluent source. */
  validate(source: string): Promise<ValidationResult>
  /** Start a run and yield the same events as `ecp run --events`. */
  run(source: string, input: unknown): AsyncIterable<PublicRunEvent>
}
