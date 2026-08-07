import {
  environment,
  harness,
  runtime,
  registerCoreFormats,
  registerTestExtension,
} from "@executioncontrolprotocol/core"
import { registerBrowserNanoHarnesses, BROWSER_NANO_HARNESS_ID } from "../harness-bindings.js"
import { registerNodeRuntime, NODE_RUNTIME_ID } from "@executioncontrolprotocol/node"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import { INTENT_EVAL_HARNESS_CONFIG } from "../harness-eval-config.js"
import {
  evalOperationsExtensionBindings,
  ollamaEvalExtensionBinding,
} from "./shared-eval-extensions.js"
import { OLLAMA_GEMMA_1B_EVAL } from "../profiles/ollama-gemma.js"

/**
 * Intent classification harness eval environment (Ollama + Gemma 1B, JSON output).
 * @category Evals
 */
export async function createHarnessOllamaIntentEnvironment() {
  const { providerId } = OLLAMA_GEMMA_1B_EVAL

  await registerCoreFormats()
  registerBrowserNanoHarnesses()
  await registerNodeRuntime()
  await registerOllamaExtension()
  await registerFormatEqlExtension()
  await registerFormatToonExtension()
  await registerTestExtension()

  return environment("harness-ollama-intent-eval", "Harness Ollama Intent Eval")
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([ollamaEvalExtensionBinding(), ...evalOperationsExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_NANO_HARNESS_ID)
        .uses(`${providerId}.generate`)
        .with({ ...INTENT_EVAL_HARNESS_CONFIG }),
    ])
}

