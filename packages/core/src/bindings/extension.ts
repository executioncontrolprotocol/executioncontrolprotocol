import type { NamespacedId } from "@executioncontrolprotocol/types"
import type { ExtensionDefinition } from "../definitions/types.js"

/** Extension binding builder. @category Environment */
export class ExtensionBindingBuilder {
  constructor(
    private readonly ref: NamespacedId | ExtensionDefinition,
    private readonly label?: string,
    private config: Record<string, unknown> = {}
  ) {}

  with(config: Record<string, unknown>): this {
    this.config = { ...this.config, ...config }
    return this
  }

  getRef(): NamespacedId | ExtensionDefinition {
    return this.ref
  }

  getLabel(): string | undefined {
    return this.label
  }

  getConfig(): Record<string, unknown> {
    return this.config
  }
}

/**
 * Bind an extension to an environment.
 * @category Environment
 */
export function extension(
  ref: NamespacedId | ExtensionDefinition | string,
  label?: string
): ExtensionBindingBuilder {
  return new ExtensionBindingBuilder(ref as NamespacedId, label)
}
