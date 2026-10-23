import type {
  CapabilityId,
  LifecycleEvent,
  NamespacedId,
  CapabilityExecution,
  CapabilityMetadata,
  ExtensionMetadata,
} from "../types/index.js"
import type { z } from "zod"
import type { ConfigSchema } from "../config-schema/index.js"

/** Capability handler signature. @category Definitions */
export type CapabilityHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: import("../runtime/context.js").CapabilityContext
) => Promise<TOutput> | TOutput

/** Hook handler signature. @category Definitions */
export type HookHandler = (
  ctx: import("../runtime/context.js").LifecycleContext
) => Promise<void | unknown> | void | unknown

/** Registered capability definition. @category Definitions */
export interface CapabilityDefinition {
  name: string
  id: CapabilityId
  inputSchema?: z.ZodType<unknown>
  outputSchema?: z.ZodType<unknown>
  handler: CapabilityHandler
  /** Where this capability executes. Omit to infer from the extension. */
  execution?: CapabilityExecution
  /** Agent-facing docs from {@code .withMetadata()}. */
  metadata?: CapabilityMetadata
}

/** Hook definition on extension/policy. @category Definitions */
export interface HookDefinition {
  event: LifecycleEvent
  handler: HookHandler
  priority?: number
  target?: string
}

/** Environment id plus optional semver range from {@link ExtensionDefinitionBuilder.supports}. @category Definitions */
export interface SupportedEnvironment {
  /** Environment definition id (for example `@executioncontrolprotocol/node`). */
  id: NamespacedId
  /** Semver range checked against the environment package version. */
  range?: string
}

/** Extension definition. @category Definitions */
export interface ExtensionDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  capabilities: CapabilityDefinition[]
  hooks: HookDefinition[]
  /** When set, extension may only be bound to these environments. Omit = all environments. */
  supportedEnvironments?: SupportedEnvironment[]
  /** Agent-facing docs from {@code .withMetadata()}. */
  metadata?: ExtensionMetadata
}

/** Environment definition (host executor plus optional default extension bindings). @category Definitions */
export interface EnvironmentDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  executor: import("../runtime/executor.js").RuntimeExecutor
  /** Package version used by {@link ExtensionDefinitionBuilder.supports} range checks. */
  version?: string
  /** Extensions bound on every instance unless the caller already bound the same id. */
  defaultExtensions?: ExtensionDefinition[]
}

/** Policy definition. @category Definitions */
export interface PolicyDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  hooks: HookDefinition[]
  /** When set, policy may only be bound to these environments. Omit = all environments. */
  supportedEnvironments?: SupportedEnvironment[]
}
