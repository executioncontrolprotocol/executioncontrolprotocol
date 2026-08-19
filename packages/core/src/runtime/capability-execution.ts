import type { CapabilityExecution } from "@executioncontrolprotocol/types"
import { BROWSER_RUNTIME_ID, NODE_RUNTIME_ID } from "./runtime-ids.js"

/** Extension shape needed to infer capability execution. @category Runtime */
export interface ExecutionExtensionHint {
  /** Runtimes this extension supports when restricted. */
  supportedRuntimes?: readonly string[]
}

/** Capability shape needed to resolve execution. @category Runtime */
export interface ExecutionCapabilityHint {
  /** Explicit execution declaration. */
  execution?: CapabilityExecution
}

/**
 * Resolve capability execution, defaulting from extension `supportedRuntimes`.
 * @category Runtime
 */
export function resolveCapabilityExecution(
  cap: ExecutionCapabilityHint,
  ext?: ExecutionExtensionHint
): CapabilityExecution {
  if (cap.execution) return cap.execution
  const supported = ext?.supportedRuntimes
  if (supported?.length === 1 && supported[0] === NODE_RUNTIME_ID) return "host"
  if (supported?.length === 1 && supported[0] === BROWSER_RUNTIME_ID) return "local"
  return "local"
}

/** Whether this runtime id is the browser host. @category Runtime */
export function isBrowserRuntimeId(runtimeId: string): boolean {
  return runtimeId === BROWSER_RUNTIME_ID
}

/** Whether this runtime id is the Node host. @category Runtime */
export function isNodeRuntimeId(runtimeId: string): boolean {
  return runtimeId === NODE_RUNTIME_ID
}
