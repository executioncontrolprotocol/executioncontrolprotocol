import type { LifecycleEvent, ValidationIssue } from "@executioncontrolprotocol/types"
import { defineExtension } from "../definitions/extension.js"
import { capabilityFor } from "../definitions/capability.js"
import { hook } from "../definitions/hook.js"
import { catalogExtension } from "../registry/extension-catalog.js"
import { globalRegistry } from "../registry/registry.js"
import { z } from "zod"

/** Recorded extension lifecycle hook events (reset via `resetLifecycleSpy()`). */
export const lifecycleSpyEvents: LifecycleEvent[] = []

/** Diagnostics from the most recent `step:failed` hook invocation. */
export let lifecycleSpyLastStepFailedDiagnostics: ValidationIssue[] | undefined

/** Capability invocation count for spy capabilities. */
export let capabilityInvokeCount = 0

/** Reset spy state between tests. */
export function resetLifecycleSpy(): void {
  lifecycleSpyEvents.length = 0
  lifecycleSpyLastStepFailedDiagnostics = undefined
  capabilityInvokeCount = 0
}

function spyHook(event: LifecycleEvent) {
  return hook(event, async (ctx) => {
    lifecycleSpyEvents.push(event)
    if (event === "step:failed" && "diagnostics" in ctx) {
      lifecycleSpyLastStepFailedDiagnostics = ctx.diagnostics
    }
  })
}

/** Lifecycle spy extension for conformance tests. @category Testing */
export const lifecycleSpyExtension = defineExtension("@executioncontrolprotocol", "lifecycle-spy")
  .withConfig({})
  .withMetadata({
    summary: "Lifecycle hook spy and fault-injection capabilities.",
    description:
      "Records lifecycle events and exposes echo, throw, and merge-state capabilities for engine conformance and store tests.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/lifecycle-spy", "echo")
      .withInput(z.object({ value: z.unknown().optional() }))
      .withOutput(z.object({ echo: z.unknown() }))
      .withMetadata({
        summary: "Echo input while incrementing invoke telemetry.",
        description:
          "Mirrors test.echo but increments capabilityInvokeCount so tests can assert step invocation order alongside hook events.",
        useCases: [
          "Lifecycle test verifies step:started fires before handler runs.",
          "Conformance suite counts capability invocations per run.",
        ],
        samplePrompts: [
          "Run lifecycle-spy echo with value probe.",
          "Invoke spy echo to trigger step hooks.",
        ],
      })
      .withHandler(async (input) => {
        capabilityInvokeCount++
        return { echo: (input as { value?: unknown }).value ?? "hi" }
      }),
    capabilityFor("@executioncontrolprotocol/lifecycle-spy", "throw")
      .withInput(z.object({}))
      .withOutput(z.object({}))
      .withMetadata({
        summary: "Always fail to exercise step:failed hooks.",
        description:
          "Throws a fixed error on every invoke. Used to assert failure diagnostics and finally hooks without external dependencies.",
        useCases: [
          "Test asserts step:failed captures handler errors.",
          "Run cancellation path after a forced step failure.",
        ],
        samplePrompts: [
          "Run the lifecycle-spy throw step.",
          "Trigger a failing capability for hook tests.",
        ],
      })
      .withHandler(async () => {
        capabilityInvokeCount++
        throw new Error("capability failed")
      }),
    capabilityFor("@executioncontrolprotocol/lifecycle-spy", "merge-state")
      .withInput(z.object({ target: z.unknown() }))
      .withOutput(z.object({ ok: z.boolean() }))
      .withMetadata({
        summary: "Merge test state via the capability store API.",
        description:
          "Calls ctx.store.merge on a supplied state handle. Verifies store wiring from capability handlers during integration tests.",
        useCases: [
          "Store test confirms merge from a step handler.",
          "Multi-step run accumulates shared state through spy merge.",
        ],
        samplePrompts: [
          "Merge { merged: true } into the run state handle.",
          "Invoke lifecycle-spy merge-state on the shared target.",
        ],
      })
      .withHandler(async (input, ctx) => {
        capabilityInvokeCount++
        const handle = (input as { target: import("@executioncontrolprotocol/types").StoreStateHandle<Record<string, unknown>> })
          .target
        await ctx.store.merge(handle, { merged: true })
        return { ok: true }
      }),
  ])
  .withHooks([
    spyHook("step:before"),
    spyHook("step:started"),
    spyHook("step:completed"),
    spyHook("step:failed"),
    spyHook("step:finally"),
  ])
  .build()

catalogExtension(lifecycleSpyExtension)

/** Register lifecycle spy extension on global registry. */
export async function registerLifecycleSpyExtension(): Promise<void> {
  if (!globalRegistry.getExtension("@executioncontrolprotocol/lifecycle-spy")) {
    await globalRegistry.registerExtension(lifecycleSpyExtension)
  }
}
