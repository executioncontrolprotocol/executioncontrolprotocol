import type { LifecycleEvent } from "@executioncontrolprotocol/types"
import type { HookDefinition } from "../definitions/types.js"
import type { LifecycleContext } from "./context.js"

/** Emit extension lifecycle hooks. */
export async function emitLifecycle(
  event: LifecycleEvent,
  hooks: HookDefinition[],
  ctx: LifecycleContext
): Promise<void> {
  const sorted = [...hooks]
    .filter((h) => h.event === event)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  for (const hook of sorted) {
    await hook.handler(ctx)
  }
}
