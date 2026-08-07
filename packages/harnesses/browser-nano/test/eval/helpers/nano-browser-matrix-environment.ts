import { harness } from "@executioncontrolprotocol/core"
import { createBrowserDemoEnvironment, registerBrowserDefaults } from "@executioncontrolprotocol/browser"
import { registerTestExtension } from "@executioncontrolprotocol/core"
import type { EvalProviderProfile } from "@executioncontrolprotocol/evals"
import { BROWSER_NANO_HARNESS_ID } from "../../../src/harness-ids.js"
import { HARNESS_NANO_BINDING } from "../../../src/harness-nano-config.js"
import { registerBrowserNanoHarnesses } from "../../../src/register.js"

async function registerNanoBrowserMatrixEval(): Promise<void> {
  await registerBrowserDefaults()
  registerBrowserNanoHarnesses()
  await registerTestExtension()
}

/**
 * Browser Nano matrix harness eval environment for browser providers (e.g. Chrome AI).
 * @category Harness
 */
export async function createNanoBrowserMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime !== "browser") {
    throw new Error(
      `createNanoBrowserMatrixEnvironment expects runtime "browser", got ${provider.runtime}`
    )
  }
  await registerNanoBrowserMatrixEval()
  const env = createBrowserDemoEnvironment(`nano-harness-${provider.id}-matrix-eval`)
  env.withHarnesses([
    harness(BROWSER_NANO_HARNESS_ID)
      .uses(provider.generateCapability)
      .with({ ...HARNESS_NANO_BINDING }),
  ])
  env.addExtensionBinding("@executioncontrolprotocol/test", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-json", {})
  return env
}
