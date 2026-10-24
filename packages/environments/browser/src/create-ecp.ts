import type { Ecp, Environment } from "@executioncontrolprotocol/core"
import { exposeBrowserRegistry, type BrowserEcpGlobal } from "./extensions/browser-registry.js"

/** Operational ECP with optional browser registry helpers on the global object. @category Environment */
export type BrowserOperationalEcp = Ecp & Partial<BrowserEcpGlobal>

/** Options for {@link createEcp}. @category Environment */
export interface CreateEcpOptions {
  /** Attach merged API to `globalThis` (default from browser-registry config). */
  exposeGlobal?: boolean
  /** Global property name (default `ecp`). */
  globalName?: string
}

/**
 * Initialize an operational {@link Ecp} instance and optionally expose it on `globalThis`.
 * Registry helpers (`registerExtension`, `freezeRegistry`) are merged when browser-registry is bound.
 * @category Environment
 */
export async function createEcp(
  env: Environment,
  options: CreateEcpOptions = {}
): Promise<BrowserOperationalEcp> {
  const ecp = await env.init()
  const registryApi = exposeBrowserRegistry()
  const merged: BrowserOperationalEcp = registryApi
    ? Object.assign(ecp, {
        registerExtension: registryApi.registerExtension.bind(registryApi),
        freezeRegistry: registryApi.freezeRegistry.bind(registryApi),
        isRegistryFrozen: registryApi.isRegistryFrozen.bind(registryApi),
        getEnvironment: registryApi.getEnvironment.bind(registryApi),
      })
    : ecp

  if (options.exposeGlobal !== false && typeof globalThis !== "undefined") {
    const globalName = options.globalName ?? "ecp"
    ;(globalThis as Record<string, unknown>)[globalName] = merged
  }

  return merged
}
