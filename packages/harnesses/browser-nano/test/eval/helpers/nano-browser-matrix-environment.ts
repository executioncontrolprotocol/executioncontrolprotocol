import { harness } from "@executioncontrolprotocol/core"
import {
  createBrowserEnvironment,
  registerBrowserHost,
} from "@executioncontrolprotocol/browser"
import { registerTestExtension } from "@executioncontrolprotocol/core"
import { registerChromeAiExtension } from "@executioncontrolprotocol/chrome-ai"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import "@executioncontrolprotocol/chrome-ai"
import "@executioncontrolprotocol/format-eql"
import "@executioncontrolprotocol/format-toon"
import type { EvalProviderProfile } from "@executioncontrolprotocol/evals"
import { BROWSER_NANO_HARNESS_ID } from "../../../src/harness-ids.js"
import { HARNESS_NANO_BINDING } from "../../../src/harness-nano-config.js"
import { registerBrowserNanoHarnesses } from "../../../src/register.js"

async function registerNanoBrowserMatrixEval(): Promise<void> {
  await registerBrowserHost()
  registerBrowserNanoHarnesses()
  await registerChromeAiExtension()
  await registerFormatEqlExtension()
  await registerFormatToonExtension()
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
  const env = createBrowserEnvironment(`nano-harness-${provider.id}-matrix-eval`)
  env.addExtensionBinding("@executioncontrolprotocol/chrome-ai", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-eql", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-toon", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-json", {})
  env.addExtensionBinding("@executioncontrolprotocol/test", {})
  env.withHarnesses([
    harness(BROWSER_NANO_HARNESS_ID)
      .uses(provider.generateCapability)
      .with({ ...HARNESS_NANO_BINDING }),
  ])
  return env
}
