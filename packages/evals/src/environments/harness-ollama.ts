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
import { HARNESS_NANO_BINDING } from "../harness-eval-config.js"
import {
  evalOperationsExtensionBindings,
  ollamaEvalExtensionBinding,
} from "./shared-eval-extensions.js"
import { OLLAMA_GEMMA_1B_EVAL } from "../profiles/ollama-gemma.js"

/**
 * Combined harness eval environment (workflow + intent) using the Gemma 1B profile.
 * Prefer {@link createHarnessOllamaWorkflowEnvironment} or {@link createHarnessOllamaIntentEnvironment} for eval sets.
 * @category Evals
 */
export async function createHarnessOllamaEnvironment() {
  const { providerId } = OLLAMA_GEMMA_1B_EVAL

  await registerCoreFormats()
  registerBrowserNanoHarnesses()
  await registerNodeRuntime()
  await registerOllamaExtension()
  await registerFormatEqlExtension()
  await registerFormatToonExtension()
  await registerTestExtension()

  return environment("harness-ollama-eval", "Harness Ollama Eval")
    .withRuntime(runtime(NODE_RUNTIME_ID))
    .withExtensions([ollamaEvalExtensionBinding(), ...evalOperationsExtensionBindings()])
    .withHarnesses([
      harness(BROWSER_NANO_HARNESS_ID)
        .uses(`${providerId}.generate`)
        .with({ ...HARNESS_NANO_BINDING }),
    ])
}

export { createHarnessOllamaWorkflowEnvironment } from "./harness-ollama-workflow.js"
export { createHarnessOllamaIntentEnvironment } from "./harness-ollama-intent.js"

