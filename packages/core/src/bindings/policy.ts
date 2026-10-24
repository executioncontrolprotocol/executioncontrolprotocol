import type { NamespacedId } from "../types/index.js"
import type { PolicyDefinition } from "../definitions/types.js"

/** Policy binding builder. @category Environment */
export class PolicyBindingBuilder {
  /** Discriminator so `instanceof` is not required across bundled copies. */
  readonly kind = "policy" as const
  private range?: string
  private packageName?: string

  constructor(
    private readonly ref: NamespacedId | PolicyDefinition,
    private readonly label?: string,
    private config: Record<string, unknown> = {}
  ) {}

  with(config: Record<string, unknown>): this {
    this.config = { ...this.config, ...config }
    return this
  }

  /**
   * Declare the npm package and semver range this binding requires.
   * `pkg` overrides the default `@scope/plugin-<name>` mapping.
   * @category Environment
   */
  requires(range: string, pkg?: string): this {
    this.range = range
    if (pkg !== undefined) this.packageName = pkg
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

  /** Semver range from {@link PolicyBindingBuilder.requires}. @category Environment */
  getRange(): string | undefined {
    return this.range
  }

  /** Package override from {@link PolicyBindingBuilder.requires}. @category Environment */
  getPackage(): string | undefined {
    return this.packageName
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
