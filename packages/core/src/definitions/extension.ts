import type { ExtensionMetadata, NamespacedId } from "../types/index.js"
import { parseExtensionMetadata } from "../types/index.js"
import { z } from "zod"
import type {
  CapabilityDefinition,
  ExtensionDefinition,
  HookDefinition,
  SupportedEnvironment,
} from "./types.js"
import type { ConfigSchema } from "../config-schema/index.js"

function toId(namespace: string, name: string): NamespacedId {
  const ns = namespace.startsWith("@") ? namespace : `@${namespace}`
  return `${ns}/${name}` as NamespacedId
}

/** Fluent extension definition builder. @category Definitions */
export class ExtensionDefinitionBuilder {
  private configSchema?: ConfigSchema
  private capabilities: CapabilityDefinition[] = []
  private hooks: HookDefinition[] = []
  private supportedEnvironments: SupportedEnvironment[] = []
  private metadata?: ExtensionMetadata

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /**
   * Restrict this extension to an environment. Call several times to allow more than one.
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

  /** Set extension config Zod schema. */
  withConfig(schema: ConfigSchema | z.ZodRawShape): this {
    if ("safeParse" in schema) {
      this.configSchema = schema as ConfigSchema
    } else {
      this.configSchema = z.object(schema) as ConfigSchema
    }
    return this
  }

  /**
   * Attach agent-facing extension docs.
   * Typed from {@link ExtensionMetadata}; runtime parse rejects unknown keys and banned prose.
   * @category Definitions
   */
  withMetadata(metadata: ExtensionMetadata): this {
    this.metadata = parseExtensionMetadata(metadata)
    return this
  }

  /** Register capability definitions. */
  withCapabilities(caps: CapabilityDefinition[]): this {
    this.capabilities = caps
    return this
  }

  /** Register lifecycle hooks. */
  withHooks(hooks: HookDefinition[]): this {
    this.hooks = hooks
    return this
  }

  /** Build extension definition. */
  build(): ExtensionDefinition {
    const id = toId(this.namespace, this.name)
    return {
      id,
      namespace: this.namespace,
      name: this.name,
      configSchema: this.configSchema,
      capabilities: this.capabilities,
      hooks: this.hooks,
      ...(this.supportedEnvironments.length > 0
        ? { supportedEnvironments: this.supportedEnvironments }
        : {}),
      ...(this.metadata ? { metadata: this.metadata } : {})
    }
  }
}

/**
 * Define an extension.
 * @category Definitions
 */
export function defineExtension(
  namespace: string,
  name: string
): ExtensionDefinitionBuilder {
  return new ExtensionDefinitionBuilder(namespace, name)
}
