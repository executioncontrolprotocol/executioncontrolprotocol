import { harness } from "@executioncontrolprotocol/core"
import { createBrowserDemoEnvironment, registerBrowserDefaults } from "@executioncontrolprotocol/browser"
import { registerTestExtension } from "@executioncontrolprotocol/core"
import { BROWSER_NANO_HARNESS_ID } from "../harness-bindings.js"
import { HARNESS_NANO_BINDING } from "../harness-eval-config.js"
import type { EvalProviderProfile } from "../profiles/eval-provider.js"

async function registerBrowserMatrixEval(): Promise<void> {
  await registerBrowserDefaults()
  await registerTestExtension()
}

/**
 * Matrix harness eval environment for browser providers (e.g. Chrome Nano).
 * Same harness binding as Node matrix; no Node-only extension imports.
 * @category Evals
 */
export async function createHarnessBrowserMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime !== "browser") {
    throw new Error(
      `createHarnessBrowserMatrixEnvironment expects runtime "browser", got ${provider.runtime}`
    )
  }
  await registerBrowserMatrixEval()
  const env = createBrowserDemoEnvironment(`harness-${provider.id}-matrix-eval`)
  env.withHarnesses([
    harness(BROWSER_NANO_HARNESS_ID)
      .uses(provider.generateCapability)
      .with({ ...HARNESS_NANO_BINDING }),
  ])
  env.addExtensionBinding("@executioncontrolprotocol/test", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-json", {})
  return env
}
