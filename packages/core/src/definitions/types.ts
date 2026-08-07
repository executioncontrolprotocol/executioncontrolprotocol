import type {
  CapabilityId,
  LifecycleEvent,
  NamespacedId,
} from "@executioncontrolprotocol/types"
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
}

/** Hook definition on extension/policy. @category Definitions */
export interface HookDefinition {
  event: LifecycleEvent
  handler: HookHandler
  priority?: number
  target?: string
}

/** Extension definition. @category Definitions */
export interface ExtensionDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  capabilities: CapabilityDefinition[]
  hooks: HookDefinition[]
  /** When set, extension may only be bound to these runtimes. Omit = all runtimes. */
  supportedRuntimes?: NamespacedId[]
}

/** Runtime definition. @category Definitions */
export interface RuntimeDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  executor: import("../runtime/executor.js").RuntimeExecutor
}

/** Policy definition. @category Definitions */
export interface PolicyDefinition {
  id: NamespacedId
  namespace: string
  name: string
  configSchema?: ConfigSchema
  hooks: HookDefinition[]
}
