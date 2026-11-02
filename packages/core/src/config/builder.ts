import type { EnvironmentBinding } from "../environment/environment.js"

/**
 * Machine-local config builder. Holds extension and policy bindings only.
 * It is not an environment and cannot {@link Environment.init}.
 *
 * @category Config
 */
export class ConfigBuilder {
  /**
   * Discriminator so `instanceof` is not required across bundled copies.
   */
  readonly kind = "config" as const
  private bindings: EnvironmentBinding[] = []

  /**
   * Bind extensions and policies. Call more than once to accumulate.
   *
   * @category Config
   */
  with(bindings: EnvironmentBinding[]): this {
    this.bindings.push(...bindings)
    return this
  }

  /**
   * Bindings from {@link ConfigBuilder.with}.
   *
   * @category Config
   */
  getBindings(): EnvironmentBinding[] {
    return [...this.bindings]
  }
}

/**
 * Create a machine-local config file builder (`config.ecp.ts`).
 *
 * @category Config
 */
export function config(): ConfigBuilder {
  return new ConfigBuilder()
}

/**
 * True when `value` is a {@link ConfigBuilder} (including across bundled copies).
 *
 * @category Config
 */
export function isConfigBuilder(value: unknown): value is ConfigBuilder {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { kind?: string; getBindings?: unknown }
  return candidate.kind === "config" && typeof candidate.getBindings === "function"
}
