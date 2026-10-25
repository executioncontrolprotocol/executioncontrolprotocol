/**
 * Host services bound with {@link Environment.use}.
 * @packageDocumentation
 * @category Environment
 */

/**
 * Every `.use()` provider. `service` is required and not assignable.
 * @category Environment
 */
export interface ServiceProvider<Id extends string = string> {
  /** Interface id this object implements (OSGi-style). */
  readonly service: Id
}

/**
 * Lookup token for {@link Environment.get}. The phantom field selects `T`.
 * @category Environment
 */
export interface ServiceToken<T extends ServiceProvider = ServiceProvider> {
  /** Interface id, equal to {@link ServiceProvider.service}. */
  readonly id: T["service"]
  /** Phantom so {@link ServiceMap.get} returns `T`. */
  readonly __service?: T
}

/**
 * Snapshot {@link ServiceProvider.service} as a map key.
 * A later write on the concrete object does not retarget the registration.
 * @category Environment
 */
export function snapshotServiceId(provider: ServiceProvider): string {
  const id = provider.service
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Service provider requires a non-empty service id")
  }
  return id
}

/**
 * Narrow a provider to `T` when `provider.service` matches {@link ServiceToken.id}.
 * @category Environment
 */
export function isService<T extends ServiceProvider>(
  provider: ServiceProvider,
  token: ServiceToken<T>
): provider is T {
  return provider.service === token.id
}
