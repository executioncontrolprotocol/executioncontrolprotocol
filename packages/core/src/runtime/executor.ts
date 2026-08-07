import type { RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"

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
}

/** Runtime executor interface. @category Runtime */
export interface RuntimeExecutor {
  execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult>
}
