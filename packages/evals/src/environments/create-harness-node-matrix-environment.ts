import { environment, harness, runtime, registerCoreFormats, registerTestExtension } from "@executioncontrolprotocol/core"
import { registerBrowserNanoHarnesses, BROWSER_NANO_HARNESS_ID } from "../harness-bindings.js"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import { HARNESS_NANO_BINDING } from "../harness-eval-config.js"
import type { EvalProviderProfile } from "../profiles/eval-provider.js"
import { matrixExtensionBindings, providerExtensionBinding } from "./shared-eval-extensions.js"

async function registerNodeMatrixEval(provider: EvalProviderProfile): Promise<void> {
  await registerCoreFormats()
  registerBrowserNanoHarnesses()
  await registerNodeRuntime()
  if (provider.providerId === "@executioncontrolprotocol/ollama") {
    await registerOllamaExtension()
  }
  await registerFormatEqlExtension()
  await registerFormatToonExtension()
  await registerTestExtension()
}

/**
 * Matrix harness eval environment for Node providers (e.g. Ollama).
 * @category Evals
 */
export async function createHarnessNodeMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime !== "node") {
    throw new Error(
      `createHarnessNodeMatrixEnvironment expects runtime "node", got ${provider.runtime}`
    )
  }
  await registerNodeMatrixEval(provider)
  return environment(`harness-${provider.id}-matrix-eval`, `Harness ${provider.id} Matrix Eval`)
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([providerExtensionBinding(provider), ...matrixExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_NANO_HARNESS_ID)
        .uses(provider.generateCapability)
        .with({ ...HARNESS_NANO_BINDING }),
    ])
}
