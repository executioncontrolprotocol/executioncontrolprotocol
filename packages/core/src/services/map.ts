import {
  snapshotServiceId,
  type ServiceProvider,
  type ServiceToken,
} from "./provider.js"

/**
 * Environment-scoped map of service id → provider.
 * @category Environment
 */
export class ServiceMap {
  private readonly providers = new Map<string, ServiceProvider>()

  /**
   * Bind a provider. A second call with the same id replaces the previous one.
   * @category Environment
   */
  use(provider: ServiceProvider): this {
    const id = snapshotServiceId(provider)
    this.providers.set(id, provider)
    return this
  }

  /**
   * Look up a provider by token id.
   * @category Environment
   */
  get<T extends ServiceProvider>(token: ServiceToken<T>): T | undefined {
    const found = this.providers.get(token.id)
    return found as T | undefined
  }

  /**
   * Copy the map. Provider objects are shared; keys stay the snapshot ids.
   * @category Environment
   */
  clone(): ServiceMap {
    const next = new ServiceMap()
    for (const [id, provider] of this.providers) {
      next.providers.set(id, provider)
    }
    return next
  }
}
