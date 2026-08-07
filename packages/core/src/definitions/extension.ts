import type { NamespacedId } from "@executioncontrolprotocol/types"
import { z } from "zod"
import type {
  CapabilityDefinition,
  ExtensionDefinition,
  HookDefinition,
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
  private supportedRuntimes?: NamespacedId[]

  constructor(
    private readonly namespace: string,
    private readonly name: string
  ) {}

  /** Restrict this extension to specific runtime hosts. Omit for universal support. */
  withSupportedRuntimes(runtimes: NamespacedId[]): this {
    this.supportedRuntimes = runtimes
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
      supportedRuntimes: this.supportedRuntimes,
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
