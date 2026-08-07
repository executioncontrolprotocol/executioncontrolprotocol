import { environment, extension, harness, runtime, registerCoreFormats, registerTestExtension } from "@executioncontrolprotocol/core"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import type { EvalProviderProfile } from "@executioncontrolprotocol/evals"
import { OLLAMA_GEMMA_1B_EVAL } from "@executioncontrolprotocol/evals"
import { BROWSER_NANO_HARNESS_ID } from "../../../src/harness-ids.js"
import { HARNESS_NANO_BINDING } from "../../../src/harness-nano-config.js"
import { registerBrowserNanoHarnesses } from "../../../src/register.js"
import { NANO_MATRIX_EVAL_EXTENSION_IDS } from "./nano-matrix-extensions.js"

async function registerNanoNodeMatrixEval(provider: EvalProviderProfile): Promise<void> {
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

function matrixExtensionBindings() {
  return NANO_MATRIX_EVAL_EXTENSION_IDS.map((id) => extension(id).with({}))
}

function providerExtensionBinding(profile: EvalProviderProfile) {
  return extension(profile.providerId).with(profile.extensionBinding ?? {})
}

/**
 * Browser Nano matrix harness eval environment for Node providers (e.g. Ollama).
 * @category Harness
 */
export async function createNanoNodeMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime !== "node") {
    throw new Error(
      `createNanoNodeMatrixEnvironment expects runtime "node", got ${provider.runtime}`
    )
  }
  await registerNanoNodeMatrixEval(provider)
  return environment(`nano-harness-${provider.id}-matrix-eval`, `Nano Harness ${provider.id} Matrix Eval`)
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([providerExtensionBinding(provider), ...matrixExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_NANO_HARNESS_ID)
        .uses(provider.generateCapability)
        .with({ ...HARNESS_NANO_BINDING }),
    ])
}

/** Browser Nano full matrix environment (Ollama Gemma 1B). */
export async function createNanoOllamaMatrixEnvironment() {
  return createNanoNodeMatrixEnvironment(OLLAMA_GEMMA_1B_EVAL)
}
