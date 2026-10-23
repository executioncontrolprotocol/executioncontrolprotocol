import type { CapabilityExecution } from "../types/index.js"
import { BROWSER_ENVIRONMENT_ID, NODE_ENVIRONMENT_ID } from "./runtime-ids.js"
import type { SupportedEnvironment } from "../definitions/types.js"

/** Extension shape needed to infer capability execution. @category Runtime */
export interface ExecutionExtensionHint {
  /** Environments this extension supports when restricted. */
  supportedEnvironments?: readonly SupportedEnvironment[]
}

/** Capability shape needed to resolve execution. @category Runtime */
export interface ExecutionCapabilityHint {
  /** Explicit execution declaration. */
  execution?: CapabilityExecution
}

/**
 * Resolve capability execution, defaulting from extension `supportedEnvironments`.
 * Unrestricted capabilities default to **host**; browser-only extensions default to **local**.
 * @category Runtime
 */
export function resolveCapabilityExecution(
  cap: ExecutionCapabilityHint,
  ext?: ExecutionExtensionHint
): CapabilityExecution {
  if (cap.execution) return cap.execution
  const supported = ext?.supportedEnvironments
  if (supported?.length === 1 && supported[0]?.id === NODE_ENVIRONMENT_ID) return "host"
  if (supported?.length === 1 && supported[0]?.id === BROWSER_ENVIRONMENT_ID) return "local"
  return "host"
}

/** Whether this environment id is the browser host. @category Environment */
export function isBrowserEnvironmentId(environmentId: string): boolean {
  return environmentId === BROWSER_ENVIRONMENT_ID
}

/** Whether this environment id is the Node host. @category Environment */
export function isNodeEnvironmentId(environmentId: string): boolean {
  return environmentId === NODE_ENVIRONMENT_ID
}
