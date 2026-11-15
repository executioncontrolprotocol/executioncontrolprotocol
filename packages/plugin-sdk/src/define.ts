import type { Handler as ProtocolHandler, HandlerContext } from "@executioncontrolprotocol/protocol"
import type { z } from "zod"

const PLUGIN_ID = /^@[a-z0-9-]+\/[a-z0-9-]+$/
const CAPABILITY_KEY = /^[a-z][a-z0-9-]{0,63}$/

/**
 * Error thrown when a plugin or capability definition is invalid.
 * @category Plugins
 */
export class PluginDefinitionError extends Error {
  /** Stable machine-readable reason. */
  readonly code: string

  /**
   * @param code Short reason code.
   * @param message One sentence for the author.
   */
  constructor(code: string, message: string) {
    super(message)
    this.name = "PluginDefinitionError"
    this.code = code
  }
}

/**
 * Lazy handler loader. The module's default export is the handler.
 * @category Plugins
 */
export type HandlerThunk<Input = unknown, Output = unknown, Config = Record<string, unknown> | undefined> = () => Promise<{
  default: ProtocolHandler<Input, Output, Config>
}>

/**
 * One capability definition produced by {@link capability}.
 * @category Plugins
 */
export interface CapabilityDefinition<
  TAccepts extends z.ZodType = z.ZodType,
  TReturns extends z.ZodType = z.ZodType,
  TConfig = Record<string, unknown> | undefined,
> {
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description: string
  /** When to call it. */
  useCases: string[]
  /** What to take from the output. */
  projections: string[]
  /** Zod input schema. */
  accepts: TAccepts
  /** Zod output schema. */
  returns: TReturns
  /** Step timeout in milliseconds. */
  timeoutMs?: number
  /** Lazy import of the handler module. */
  handler: HandlerThunk<z.infer<TAccepts>, z.infer<TReturns>, TConfig>
}

/**
 * Options for {@link capability}.
 * @category Plugins
 */
export type CapabilityOptions<
  TAccepts extends z.ZodType,
  TReturns extends z.ZodType,
  TConfig = Record<string, unknown> | undefined,
> = CapabilityDefinition<TAccepts, TReturns, TConfig>

/**
 * A completed plugin definition produced by {@link definePlugin}.
 * @category Plugins
 */
export interface PluginDefinition<
  TConfig extends z.ZodType | undefined = z.ZodType | undefined,
  TCapabilities extends Record<string, CapabilityDefinition> = Record<string, CapabilityDefinition>,
> {
  /** Plugin id (`@scope/name`). */
  id: string
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description: string
  /** Zod config schema, when the plugin declares config. */
  config?: TConfig
  /** Capability key to definition. */
  capabilities: TCapabilities
}

/**
 * Input type of a capability definition.
 * @category Plugins
 */
export type CapabilityInput<C> = C extends CapabilityDefinition<infer A, z.ZodType, unknown> ? z.infer<A> : never

/**
 * Output type of a capability definition.
 * @category Plugins
 */
export type CapabilityOutput<C> = C extends CapabilityDefinition<z.ZodType, infer R, unknown> ? z.infer<R> : never

/**
 * Config type of a capability or plugin definition.
 * @category Plugins
 */
export type PluginConfig<C> = C extends PluginDefinition<infer Config, Record<string, CapabilityDefinition>>
  ? Config extends z.ZodType
    ? z.infer<Config>
    : undefined
  : C extends CapabilityDefinition<z.ZodType, z.ZodType, infer Config>
    ? Config
    : never

/**
 * Handler typed from a {@link CapabilityDefinition}.
 * @category Plugins
 */
export type Handler<C> = C extends CapabilityDefinition<infer A, infer R, infer Config>
  ? (input: z.infer<A>, ctx: HandlerContext<Config>) => Promise<z.infer<R>>
  : ProtocolHandler

/**
 * Declare one capability. Validates metadata and that `handler` is a lazy thunk.
 * @category Plugins
 */
export function capability<TAccepts extends z.ZodType, TReturns extends z.ZodType, TConfig = Record<string, unknown> | undefined>(
  options: CapabilityOptions<TAccepts, TReturns, TConfig>,
): CapabilityDefinition<TAccepts, TReturns, TConfig> {
  if (!Array.isArray(options.useCases) || options.useCases.length < 1) {
    throw new PluginDefinitionError("ECP_PLUGIN_DEFINITION", "Each capability needs at least one useCases entry.")
  }
  if (!Array.isArray(options.projections) || options.projections.length < 1) {
    throw new PluginDefinitionError("ECP_PLUGIN_DEFINITION", "Each capability needs at least one projections entry.")
  }
  if (typeof options.handler !== "function") {
    throw new PluginDefinitionError(
      "ECP_PLUGIN_DEFINITION",
      "capability.handler must be a lazy () => import(...) thunk so the registry never loads handler code.",
    )
  }
  if (!options.summary || !options.description) {
    throw new PluginDefinitionError("ECP_PLUGIN_DEFINITION", "Each capability needs summary and description.")
  }
  return {
    summary: options.summary,
    description: options.description,
    useCases: options.useCases,
    projections: options.projections,
    accepts: options.accepts,
    returns: options.returns,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    handler: options.handler,
  }
}

/**
 * Declare a plugin. Validates the id and every capability key.
 * @category Plugins
 */
export function definePlugin<
  TConfig extends z.ZodType | undefined = undefined,
  TCapabilities extends Record<string, CapabilityDefinition> = Record<string, CapabilityDefinition>,
>(options: {
  /** Plugin id (`@scope/name`). */
  id: string
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description: string
  /** Zod config schema. */
  config?: TConfig
  /** Capability key to definition. */
  capabilities: TCapabilities
}): PluginDefinition<TConfig, TCapabilities> {
  if (!PLUGIN_ID.test(options.id)) {
    throw new PluginDefinitionError(
      "ECP_PLUGIN_DEFINITION",
      `Plugin id ${options.id} must match @scope/name with lowercase kebab segments.`,
    )
  }
  if (!options.summary || !options.description) {
    throw new PluginDefinitionError("ECP_PLUGIN_DEFINITION", "Plugin needs summary and description.")
  }
  const keys = Object.keys(options.capabilities)
  if (keys.length === 0) {
    throw new PluginDefinitionError("ECP_PLUGIN_DEFINITION", "Plugin needs at least one capability.")
  }
  for (const key of keys) {
    if (!CAPABILITY_KEY.test(key)) {
      throw new PluginDefinitionError(
        "ECP_PLUGIN_DEFINITION",
        `Capability key ${key} must match ^[a-z][a-z0-9-]{0,63}$.`,
      )
    }
  }
  return {
    id: options.id,
    summary: options.summary,
    description: options.description,
    ...(options.config === undefined ? {} : { config: options.config }),
    capabilities: options.capabilities,
  }
}
