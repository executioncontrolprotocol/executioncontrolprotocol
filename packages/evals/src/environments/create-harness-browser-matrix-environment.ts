import { harness, registerTestExtension } from "@executioncontrolprotocol/core"
import {
  createBrowserEnvironment,
  registerBrowserHost,
} from "@executioncontrolprotocol/browser"
import { registerChromeAiExtension } from "@executioncontrolprotocol/chrome-ai"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import "@executioncontrolprotocol/chrome-ai"
import "@executioncontrolprotocol/format-eql"
import "@executioncontrolprotocol/format-toon"
import { BROWSER_NANO_HARNESS_ID, registerBrowserNanoHarnesses } from "../harness-bindings.js"
import { HARNESS_NANO_BINDING } from "../harness-eval-config.js"
import type { EvalProviderProfile } from "../profiles/eval-provider.js"

async function registerBrowserMatrixEval(): Promise<void> {
  await registerBrowserHost()
  registerBrowserNanoHarnesses()
  await registerChromeAiExtension()
  await registerFormatEqlExtension()
  await registerFormatToonExtension()
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
  const env = createBrowserEnvironment(`harness-${provider.id}-matrix-eval`)
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
