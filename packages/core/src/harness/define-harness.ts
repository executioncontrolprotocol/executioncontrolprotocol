import type { HarnessId, NamespacedId } from "@executioncontrolprotocol/types"
import { ECP_MODEL_GENERATE_INTERFACE } from "@executioncontrolprotocol/types"
import type { z } from "zod"
import { getCatalogedHarness } from "./harness-catalog.js"
import type { ErasedHarnessHandler, HarnessDefinition, HarnessHandler } from "./types.js"

function toHarnessId(namespace: string, name: string): HarnessId {
  const ns = namespace.startsWith("@") ? namespace : `@${namespace}`
  return `${ns}/${name}` as HarnessId
}

/** Fluent harness definition builder with Zod-inferred handler types. @category Harness */
export class HarnessDefinitionBuilder<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TInput = unknown,
  TOutput = unknown,
> {
  private configSchema?: z.ZodType
  private inputSchema?: z.ZodType
  private outputSchema?: z.ZodType
  private providerInterface: typeof ECP_MODEL_GENERATE_INTERFACE = ECP_MODEL_GENERATE_INTERFACE
  private handler?: HarnessHandler<TInput, TOutput, TConfig>

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /** Environment binding config schema. */
  withConfig<S extends z.ZodType>(
    schema: S
  ): HarnessDefinitionBuilder<z.infer<S> & Record<string, unknown>, TInput, TOutput> {
    const next = this as HarnessDefinitionBuilder<
      z.infer<S> & Record<string, unknown>,
      TInput,
      TOutput
    >
    next.configSchema = schema
    return next
  }

  /** Invoke input schema. */
  withInput<S extends z.ZodType>(
    schema: S
  ): HarnessDefinitionBuilder<TConfig, z.infer<S>, TOutput> {
    const next = this as HarnessDefinitionBuilder<TConfig, z.infer<S>, TOutput>
    next.inputSchema = schema
    return next
  }

  /** Invoke output schema. */
  withOutput<S extends z.ZodType>(
    schema: S
  ): HarnessDefinitionBuilder<TConfig, TInput, z.infer<S>> {
    const next = this as HarnessDefinitionBuilder<TConfig, TInput, z.infer<S>>
    next.outputSchema = schema
    return next
  }

  /** Required provider interface tag. */
  usesProviderInterface(iface: typeof ECP_MODEL_GENERATE_INTERFACE): this {
    this.providerInterface = iface
    return this
  }

  /** Harness evaluate handler (input and config types inferred from Zod schemas). */
  withHandler(handler: HarnessHandler<TInput, TOutput, TConfig>): this {
    this.handler = handler
    return this
  }

  /** Build harness definition. */
  build(): HarnessDefinition {
    if (!this.handler) {
      throw new Error(`Harness ${toHarnessId(this.namespace, this.name)} requires .withHandler()`)
    }
    const id = toHarnessId(this.namespace, this.name)
    const erasedHandler = this.handler as ErasedHarnessHandler
    return {
      id,
      namespace: this.namespace,
      name: this.name,
      configSchema: this.configSchema,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      providerInterface: this.providerInterface,
      handler: erasedHandler,
    }
  }
}

/**
 * Define a catalog harness.
 * @category Harness
 */
export function defineHarness(namespace: string, name: string): HarnessDefinitionBuilder {
  return new HarnessDefinitionBuilder(namespace, name)
}

/** Type guard for inline harness definition. @category Harness */
export function isHarnessDefinition(ref: unknown): ref is HarnessDefinition {
  return (
    typeof ref === "object" &&
    ref !== null &&
    "id" in ref &&
    "handler" in ref &&
    typeof (ref as HarnessDefinition).handler === "function"
  )
}

/** Resolve harness ref to definition. @category Harness */
export function resolveHarnessRef(ref: NamespacedId | HarnessDefinition | string): HarnessDefinition | undefined {
  if (isHarnessDefinition(ref)) return ref
  return getCatalogedHarness(ref)
}
