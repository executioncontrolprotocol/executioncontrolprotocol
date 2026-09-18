import { environment, extension, harness, runtime, registerCoreFormats, registerTestExtension } from "@executioncontrolprotocol/core"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import { registerAnthropicExtension } from "@executioncontrolprotocol/anthropic"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import {
  ANTHROPIC_CLAUDE_SONNET_45_EVAL,
  OLLAMA_QWEN_CODER_15B_EVAL,
  setActiveEvalProvider,
  type EvalProviderProfile,
} from "@executioncontrolprotocol/evals"
import { BROWSER_CODING_HARNESS_CAPABILITY, BROWSER_CODING_HARNESS_ID } from "../../../src/harness-ids.js"
import {
  HARNESS_CODING_BINDING_MEDIUM,
  HARNESS_CODING_BINDING_SMALL,
  type HarnessCodingProfile,
  codingHarnessBindingForProfile,
} from "../../../src/harness-coding-config.js"
import { registerBrowserCodingHarnesses } from "../../../src/register.js"
import { CODING_MATRIX_EVAL_EXTENSION_IDS } from "./coding-matrix-extensions.js"

async function registerCodingNodeMatrixEval(provider: EvalProviderProfile): Promise<void> {
  await registerCoreFormats()
  registerBrowserCodingHarnesses()
  await registerNodeRuntime()
  if (provider.providerId === "@executioncontrolprotocol/ollama") {
    await registerOllamaExtension()
  }
  if (provider.providerId === "@executioncontrolprotocol/anthropic") {
    await registerAnthropicExtension()
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

export async function createCodingNodeMatrixEnvironment(
  provider: EvalProviderProfile,
  codingProfile: HarnessCodingProfile = "small"
) {
  if (provider.runtime !== "node") {
    throw new Error(
      `createCodingNodeMatrixEnvironment expects runtime "node", got ${provider.runtime}`
    )
  }
  setActiveEvalProvider(provider)
  await registerCodingNodeMatrixEval(provider)
  const binding = codingHarnessBindingForProfile(codingProfile)
  return environment(
    `coding-harness-${provider.id}-matrix-eval`,
    `Coding Harness ${provider.id} Matrix Eval`
  )
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([providerExtensionBinding(provider), ...matrixExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_CODING_HARNESS_ID)
        .uses(provider.generateCapability)
        .with({ ...binding }),
    ])
}

export async function createCodingOllamaMatrixEnvironment() {
  return createCodingNodeMatrixEnvironment(OLLAMA_QWEN_CODER_15B_EVAL, "small")
}

export async function createCodingAnthropicMatrixEnvironment() {
  return createCodingNodeMatrixEnvironment(ANTHROPIC_CLAUDE_SONNET_45_EVAL, "medium")
}

/** Effective generate/evaluate model for a coding matrix provider profile. */
export function codingMatrixProviderModel(provider: EvalProviderProfile): string | undefined {
  const fromBinding = provider.extensionBinding?.defaultModel
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim()
  return provider.model
}

export {
  BROWSER_CODING_HARNESS_CAPABILITY,
  HARNESS_CODING_BINDING_SMALL,
  HARNESS_CODING_BINDING_MEDIUM,
}
