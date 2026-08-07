import { defineRuntime, globalRegistry } from "@executioncontrolprotocol/core"
import { z } from "zod"
import type {
  RunResult,
  RuntimeExecutionContext,
  RuntimeExecutor,
  WorkflowManifest,
} from "@executioncontrolprotocol/core"

/**
 * Temporal runtime id.
 *
 * @category Runtimes
 */
export const TEMPORAL_RUNTIME_ID = "@executioncontrolprotocol/temporal" as const

/**
 * Temporal runtime id (string binding).
 *
 * @deprecated Prefer {@link TEMPORAL_RUNTIME_ID} or
 * {@link temporalRuntimeDefinition}. Retained for existing string bindings.
 * @category Runtimes
 */
export const temporalRuntime = TEMPORAL_RUNTIME_ID

/** Error thrown when the Temporal runtime executes a workflow. */
const NOT_IMPLEMENTED_MESSAGE =
  "@executioncontrolprotocol/temporal is a pre-release scaffold and cannot execute workflows yet. " +
  "Bind a host runtime such as @executioncontrolprotocol/node for local execution. Track Temporal " +
  "durable execution support before depending on this runtime in production."

/**
 * Temporal runtime executor.
 *
 * This is a typed scaffold: the runtime definition, config schema, and executor
 * contract are real so the runtime can be discovered, bound, and validated, but
 * durable execution is not implemented. {@link execute} throws a clear error
 * rather than failing in an opaque way.
 *
 * @category Runtimes
 */
export class TemporalRuntimeExecutor implements RuntimeExecutor {
  execute(
    _manifest: WorkflowManifest,
    _context: RuntimeExecutionContext
  ): Promise<RunResult> {
    return Promise.reject(new Error(NOT_IMPLEMENTED_MESSAGE))
  }
}

/**
 * Temporal runtime definition.
 *
 * Durable orchestration via Temporal is not yet implemented; binding this
 * runtime and running a workflow throws a descriptive error.
 *
 * @category Runtimes
 */
export const temporalRuntimeDefinition = defineRuntime("@executioncontrolprotocol", "temporal")
  .withConfig({
    /** Temporal task queue name. */
    taskQueue: z.string().optional(),
    /** Whether to use durable pauses (signals/updates) when implemented. */
    durablePauses: z.boolean().optional(),
  })
  .withExecutor(new TemporalRuntimeExecutor())

/**
 * Register `@executioncontrolprotocol/temporal` on a registry (idempotent).
 *
 * @category Runtimes
 */
export async function registerTemporalRuntime(
  registry = globalRegistry
): Promise<void> {
  if (!registry.getRuntime(TEMPORAL_RUNTIME_ID)) {
    await registry.registerRuntime(temporalRuntimeDefinition)
  }
}
