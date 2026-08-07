import { createHarnessNodeCodingMatrixEnvironment } from "./create-harness-node-coding-matrix-environment.js"
import { OLLAMA_QWEN_CODER_15B_EVAL } from "../profiles/ollama-qwen.js"

/**
 * Full matrix harness eval environment for Browser Coding (Ollama Qwen 3.5 4B).
 * @category Evals
 */
export async function createHarnessOllamaCodingMatrixEnvironment() {
  return createHarnessNodeCodingMatrixEnvironment(OLLAMA_QWEN_CODER_15B_EVAL)
}
