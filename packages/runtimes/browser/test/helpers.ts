import { Registry, registerTestExtension } from "@executioncontrolprotocol/core"
import { createBrowserEnvironment, registerBrowserHost } from "../src/environment.js"

/** Slim browser host environment for unit tests. */
export async function createBrowserTestEnvironment(id = "browser-test", label?: string) {
  const registry = new Registry()
  await registerTestExtension(registry)
  await registerBrowserHost(registry)
  return createBrowserEnvironment(id, label, registry)
}
