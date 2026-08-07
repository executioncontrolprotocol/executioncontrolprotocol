import type { NamespacedId } from "@executioncontrolprotocol/types"
import type { PolicyDefinition } from "../definitions/types.js"

/** Policy binding builder. @category Environment */
export class PolicyBindingBuilder {
  constructor(
    private readonly ref: NamespacedId | PolicyDefinition,
    private readonly label?: string,
    private config: Record<string, unknown> = {}
  ) {}

  with(config: Record<string, unknown>): this {
    this.config = { ...this.config, ...config }
    return this
  }

  getRef(): NamespacedId | PolicyDefinition {
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
 * Bind a policy to an environment.
 * @category Environment
 */
export function policy(
  ref: NamespacedId | PolicyDefinition | string,
  label?: string
): PolicyBindingBuilder {
  return new PolicyBindingBuilder(ref as NamespacedId, label)
}
