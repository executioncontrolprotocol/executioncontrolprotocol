import type { NamespacedId } from "@executioncontrolprotocol/types"
import type { RuntimeDefinition } from "../definitions/types.js"

/** Runtime binding builder. @category Environment */
export class RuntimeBindingBuilder {
  constructor(
    private readonly ref: NamespacedId | RuntimeDefinition,
    private readonly label?: string,
    private config: Record<string, unknown> = {}
  ) {}

  with(config: Record<string, unknown>): this {
    this.config = { ...this.config, ...config }
    return this
  }

  getRef(): NamespacedId | RuntimeDefinition {
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
 * Bind a runtime to an environment.
 * @category Environment
 */
export function runtime(
  ref: NamespacedId | RuntimeDefinition | string,
  label?: string
): RuntimeBindingBuilder {
  return new RuntimeBindingBuilder(ref as NamespacedId, label)
}
