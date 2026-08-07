import { InMemoryRuntimeExecutor } from "@executioncontrolprotocol/core"
import type { RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import type { RuntimeExecutionContext, RuntimeExecutor } from "@executioncontrolprotocol/core"

/** Node.js runtime executor (delegates to in-memory engine). @category Runtime */
export class NodeRuntimeExecutor implements RuntimeExecutor {
  private readonly inner = new InMemoryRuntimeExecutor()

  execute(
    manifest: WorkflowManifest,
    context: RuntimeExecutionContext
  ): Promise<RunResult> {
    const maxConcurrency =
      context.maxConcurrency ??
      (context.bindings.runtime.config.maxConcurrency as number | undefined)
    return this.inner.execute(manifest, { ...context, maxConcurrency })
  }
}
