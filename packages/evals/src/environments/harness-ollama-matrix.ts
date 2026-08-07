import { createHarnessMatrixEnvironment } from "./create-harness-matrix-environment.js"
import { OLLAMA_GEMMA_1B_EVAL } from "../profiles/ollama-gemma.js"

/**
 * Full matrix harness eval environment (Ollama + formatters + test + demo stubs).
 * @category Evals
 */
export async function createHarnessOllamaMatrixEnvironment() {
  return createHarnessMatrixEnvironment(OLLAMA_GEMMA_1B_EVAL)
}

