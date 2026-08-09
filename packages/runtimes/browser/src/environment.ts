import {
  environment as coreEnvironment,
  extension,
  runtime,
  policy,
  Registry,
  globalRegistry,
} from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { BROWSER_RUNTIME_ID, registerBrowserRuntime } from "./runtime/builtin-browser.js"
import { registerBrowserRegistryExtension } from "./extensions/browser-registry.js"
import { registerBrowserSessionConfigExtension } from "./extensions/browser-session-config.js"
import { registerBrowserLocalConfigExtension } from "./extensions/browser-local-config.js"
import { registerBrowserGuideExtension } from "./extensions/browser-guide.js"
import { registerBrowserSecretsExtension } from "@executioncontrolprotocol/browser-secrets"
import "@executioncontrolprotocol/browser-secrets"

/**
 * Register browser runtime host extensions (executor, registry, session, local config, guide, secrets).
 * Does not register harnesses or model providers — apps bind those.
 * @category Environment
 */
export async function registerBrowserHost(registry: Registry = globalRegistry): Promise<void> {
  await registerBrowserRuntime(registry)
  await registerBrowserRegistryExtension(registry)
  await registerBrowserSessionConfigExtension(registry)
  await registerBrowserLocalConfigExtension(registry)
  await registerBrowserGuideExtension(registry)
  await registerBrowserSecretsExtension(registry)
  await registerStandardPolicies(registry)
}

/**
 * @deprecated Use {@link registerBrowserHost}. Alias retained for callers during migration.
 * @category Environment
 */
export async function registerBrowserDefaults(registry: Registry = globalRegistry): Promise<void> {
  await registerBrowserHost(registry)
}

/**
 * Slim browser environment: runtime + host extensions only (no harnesses or model providers).
 * Apps compose providers, formats, and harnesses on top.
 * @category Environment
 */
export function createBrowserEnvironment(
  id: string,
  label?: string,
  registry: Registry = globalRegistry
): Environment {
  return coreEnvironment(id, label, registry)
    .withRuntime(runtime(BROWSER_RUNTIME_ID, "Browser Runtime"))
    .withExtensions([
      extension("@executioncontrolprotocol/browser-secrets").with({}),
      extension("@executioncontrolprotocol/browser-registry").with({
        freezeOn: "environment:beforeRun",
        autoBindRegisteredExtensions: true,
        exposeGlobal: true,
        globalName: "ecp",
      }),
      extension("@executioncontrolprotocol/browser-session-config").with({ persist: false }),
      extension("@executioncontrolprotocol/browser-local-config").with({}),
      extension("@executioncontrolprotocol/browser").with({}),
    ])
    .withPolicies([
      policy("@executioncontrolprotocol/registry-control").with({
        allowedExtensionNamespaces: [
          "@executioncontrolprotocol/browser",
          "@customer/*",
        ],
        deniedExtensionNamespaces: [],
        allowDynamicExtensionRegistration: true,
        allowAutoBind: true,
      }),
    ])
}

/**
 * @deprecated Use {@link createBrowserEnvironment}. Demo/provider/harness composition belongs in the app.
 * @category Environment
 */
export function createBrowserDemoEnvironment(
  id: string,
  label?: string,
  registry: Registry = globalRegistry
): Environment {
  return createBrowserEnvironment(id, label, registry)
}

/**
 * Create a browser environment with `@executioncontrolprotocol/browser` runtime pre-bound.
 * @category Environment
 */
export async function environment(id: string, label?: string): Promise<Environment> {
  await registerBrowserHost()
  return createBrowserEnvironment(id, label)
}
