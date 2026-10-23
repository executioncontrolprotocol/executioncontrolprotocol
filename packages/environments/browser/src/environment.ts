import {
  environment as coreEnvironment,
  extension,
  policy,
  registerEnvironmentDefinition,
  registryControlPolicy,
} from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { browserEnvironmentDefinition } from "./runtime/builtin-browser.js"
import { browserRegistryExtension } from "./extensions/browser-registry.js"
import { browserLocalConfigExtension } from "./extensions/browser-local-config.js"

const BROWSER_REGISTRY_CONTROL = {
  allowedExtensionNamespaces: [
    "@executioncontrolprotocol/browser",
    "@customer/*",
  ],
  deniedExtensionNamespaces: [] as string[],
  allowDynamicExtensionRegistration: true,
  allowAutoBind: true,
}

/**
 * Slim browser environment with implicit registry-control allow-list.
 * Apps compose providers and formats on top via `.with([...])`.
 * @category Environment
 */
export function createBrowserEnvironment(id: string, label?: string): Environment {
  registerEnvironmentDefinition(browserEnvironmentDefinition)
  return coreEnvironment(id, label).with([
    extension(browserRegistryExtension).with({
      freezeOn: "environment:beforeRun",
      autoBindRegisteredExtensions: true,
      exposeGlobal: true,
      globalName: "ecp",
    }),
    extension(browserLocalConfigExtension),
    policy(registryControlPolicy).with(BROWSER_REGISTRY_CONTROL),
  ])
}

/**
 * Create a browser environment. `id` must be `@executioncontrolprotocol/browser`.
 * @category Environment
 */
export function environment(id: string, label?: string): Environment {
  return createBrowserEnvironment(id, label)
}
