import { environment, extension, harness, runtime, registerCoreFormats, registerTestExtension } from "@executioncontrolprotocol/core"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import type { EvalProviderProfile } from "@executioncontrolprotocol/evals"
import { OLLAMA_QWEN_CODER_15B_EVAL } from "@executioncontrolprotocol/evals"
import { BROWSER_CODING_HARNESS_CAPABILITY, BROWSER_CODING_HARNESS_ID } from "../../../src/harness-ids.js"
import { HARNESS_CODING_BINDING } from "../../../src/harness-coding-config.js"
import { registerBrowserCodingHarnesses } from "../../../src/register.js"
import { CODING_MATRIX_EVAL_EXTENSION_IDS } from "./coding-matrix-extensions.js"

async function registerCodingNodeMatrixEval(provider: EvalProviderProfile): Promise<void> {
  await registerCoreFormats()
  registerBrowserCodingHarnesses()
  await registerNodeRuntime()
  if (provider.providerId === "@executioncontrolprotocol/ollama") {
    await registerOllamaExtension()
  }
  await registerFormatToonExtension()
  await registerTestExtension()
}

function matrixExtensionBindings() {
  return CODING_MATRIX_EVAL_EXTENSION_IDS.map((id) => extension(id).with({}))
}

function providerExtensionBinding(profile: EvalProviderProfile) {
  return extension(profile.providerId).with(profile.extensionBinding ?? {})
}

export async function createCodingNodeMatrixEnvironment(provider: EvalProviderProfile) {
  if (provider.runtime !== "node") {
    throw new Error(
      `createCodingNodeMatrixEnvironment expects runtime "node", got ${provider.runtime}`
    )
  }
  await registerCodingNodeMatrixEval(provider)
  return environment(
    `coding-harness-${provider.id}-matrix-eval`,
    `Coding Harness ${provider.id} Matrix Eval`
  )
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([providerExtensionBinding(provider), ...matrixExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_CODING_HARNESS_ID)
        .uses(provider.generateCapability)
        .with({ ...HARNESS_CODING_BINDING }),
    ])
}

export async function createCodingOllamaMatrixEnvironment() {
  return createCodingNodeMatrixEnvironment(OLLAMA_QWEN_CODER_15B_EVAL)
}

export { BROWSER_CODING_HARNESS_CAPABILITY }
