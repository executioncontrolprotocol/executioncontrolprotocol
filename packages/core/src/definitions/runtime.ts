import type { NamespacedId } from "@executioncontrolprotocol/types"
import { z } from "zod"
import type { RuntimeDefinition } from "./types.js"
import type { ConfigSchema } from "../config-schema/index.js"
import type { RuntimeExecutor } from "../runtime/executor.js"

function toId(namespace: string, name: string): NamespacedId {
  const ns = namespace.startsWith("@") ? namespace : `@${namespace}`
  return `${ns}/${name}` as NamespacedId
}

/** Fluent runtime definition builder. @category Definitions */
export class RuntimeDefinitionBuilder {
  private configSchema?: ConfigSchema
  private executorFn?: RuntimeExecutor

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /** Set runtime config schema. */
  withConfig(schema: ConfigSchema | z.ZodRawShape): this {
    if ("safeParse" in schema) {
      this.configSchema = schema as ConfigSchema
    } else {
      this.configSchema = z.object(schema) as ConfigSchema
    }
    return this
  }

  /** Set runtime executor. */
  withExecutor(executor: RuntimeExecutor): RuntimeDefinition {
    if (!this.executorFn && !executor) {
      throw new Error("Runtime requires an executor")
    }
    const id = toId(this.namespace, this.name)
    return {
      id,
      namespace: this.namespace,
      name: this.name,
      configSchema: this.configSchema,
      executor: executor ?? this.executorFn!,
    }
  }
}

/**
 * Define a runtime adapter.
 * @category Definitions
 */
export function defineRuntime(
  namespace: string,
  name: string
): RuntimeDefinitionBuilder {
  return new RuntimeDefinitionBuilder(namespace, name)
}
