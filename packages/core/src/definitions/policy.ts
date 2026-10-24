import type { NamespacedId } from "../types/index.js"
import { z } from "zod"
import type { HookDefinition, PolicyDefinition, SupportedEnvironment } from "./types.js"
import type { ConfigSchema } from "../config-schema/index.js"

function toId(namespace: string, name: string): NamespacedId {
  const ns = namespace.startsWith("@") ? namespace : `@${namespace}`
  return `${ns}/${name}` as NamespacedId
}

/** Fluent policy definition builder. @category Definitions */
export class PolicyDefinitionBuilder {
  private configSchema?: ConfigSchema
  private hooks: HookDefinition[] = []
  private supportedEnvironments: SupportedEnvironment[] = []

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /**
   * Restrict this policy to an environment. Call several times to allow more than one.
   * Omit entirely for universal support. `range` is a semver range against the environment package version.
   * @category Definitions
   */
  supports(environmentId: NamespacedId | string, range?: string): this {
    this.supportedEnvironments.push({
      id: environmentId as NamespacedId,
      ...(range ? { range } : {}),
    })
    return this
  }

  /** Set policy config schema. */
  withConfig(schema: ConfigSchema | z.ZodRawShape): this {
    if ("safeParse" in schema) {
      this.configSchema = schema as ConfigSchema
    } else {
      this.configSchema = z.object(schema) as ConfigSchema
    }
    return this
  }

  /** Register policy hooks. */
  withHooks(hooks: HookDefinition[]): this {
    this.hooks = hooks
    return this
  }

  /** Build policy definition. */
  build(): PolicyDefinition {
    const id = toId(this.namespace, this.name)
    return {
      id,
      namespace: this.namespace,
      name: this.name,
      configSchema: this.configSchema,
      hooks: this.hooks,
      ...(this.supportedEnvironments.length > 0
        ? { supportedEnvironments: this.supportedEnvironments }
        : {}),
    }
  }
}

/**
 * Define a policy.
 * @category Definitions
 */
export function definePolicy(
  namespace: string,
  name: string
): PolicyDefinitionBuilder {
  return new PolicyDefinitionBuilder(namespace, name)
}
