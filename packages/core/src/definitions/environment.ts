import type { NamespacedId } from "../types/index.js"
import { z } from "zod"
import type { EnvironmentDefinition, ExtensionDefinition } from "./types.js"
import type { ConfigSchema } from "../config-schema/index.js"
import type { RuntimeExecutor } from "../runtime/executor.js"

function toId(namespace: string, name: string): NamespacedId {
  const ns = namespace.startsWith("@") ? namespace : `@${namespace}`
  return `${ns}/${name}` as NamespacedId
}

const environmentDefinitions = new Map<string, EnvironmentDefinition>()

/**
 * Register an environment definition for {@link environment} lookup by id.
 * Host packages call this from their `environment()` factory.
 * @category Definitions
 */
export function registerEnvironmentDefinition(def: EnvironmentDefinition): void {
  environmentDefinitions.set(def.id, def)
}

/**
 * Look up a registered environment definition.
 * @category Definitions
 */
export function getEnvironmentDefinition(id: string): EnvironmentDefinition | undefined {
  return environmentDefinitions.get(id)
}

/** Fluent environment definition builder. @category Definitions */
export class EnvironmentDefinitionBuilder {
  private configSchema?: ConfigSchema
  private version?: string
  private defaultExtensions: ExtensionDefinition[] = []

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /** Set environment config schema. */
  withConfig(schema: ConfigSchema | z.ZodRawShape): this {
    if ("safeParse" in schema) {
      this.configSchema = schema as ConfigSchema
    } else {
      this.configSchema = z.object(schema) as ConfigSchema
    }
    return this
  }

  /** Set the package version used by `.supports(..., range)` checks. */
  withVersion(version: string): this {
    this.version = version
    return this
  }

  /** Bind these extensions on every instance of this environment. */
  withDefaultExtensions(extensions: ExtensionDefinition[]): this {
    this.defaultExtensions = extensions
    return this
  }

  /** Set the host executor and build the definition. */
  withExecutor(executor: RuntimeExecutor): EnvironmentDefinition {
    if (!executor) {
      throw new Error("Environment requires an executor")
    }
    const id = toId(this.namespace, this.name)
    return {
      id,
      namespace: this.namespace,
      name: this.name,
      configSchema: this.configSchema,
      executor,
      ...(this.version ? { version: this.version } : {}),
      ...(this.defaultExtensions.length > 0 ? { defaultExtensions: this.defaultExtensions } : {}),
    }
  }
}

/**
 * Define an environment adapter.
 * @category Definitions
 */
export function defineEnvironment(
  namespace: string,
  name: string
): EnvironmentDefinitionBuilder {
  return new EnvironmentDefinitionBuilder(namespace, name)
}
