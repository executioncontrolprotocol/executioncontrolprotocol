import type { NamespacedId } from "../types/index.js"
import type { ExtensionDefinition } from "../definitions/types.js"

/** Extension binding builder. @category Environment */
export class ExtensionBindingBuilder {
  private range?: string
  private packageName?: string

  constructor(
    private readonly ref: NamespacedId | ExtensionDefinition,
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

  getRef(): NamespacedId | ExtensionDefinition {
    return this.ref
  }

  getLabel(): string | undefined {
    return this.label
  }

  getConfig(): Record<string, unknown> {
    return this.config
  }

  /** Semver range from {@link ExtensionBindingBuilder.requires}. @category Environment */
  getRange(): string | undefined {
    return this.range
  }

  /** Package override from {@link ExtensionBindingBuilder.requires}. @category Environment */
  getPackage(): string | undefined {
    return this.packageName
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
