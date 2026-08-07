import type { LifecycleEvent } from "@executioncontrolprotocol/types"
import type { HookDefinition, HookHandler } from "./types.js"

/**
 * Define a lifecycle hook.
 * @category Definitions
 */
export function hook(
  event: LifecycleEvent,
  handler: HookHandler,
  options?: { priority?: number; target?: string }
): HookDefinition {
  return {
    event,
    handler,
    ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    ...(options?.target !== undefined ? { target: options.target } : {}),
  }
}
