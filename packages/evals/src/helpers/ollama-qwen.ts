import {
  OLLAMA_QWEN_CODER_15B_BASE_URL,
  OLLAMA_QWEN_CODER_15B_EVAL,
  type OllamaQwenCoderEvalProfile,
} from "../profiles/ollama-qwen.js"
import { ollamaHasModel, ollamaReachable, type OllamaEvalReadiness } from "./ollama.js"

/**
 * Check Ollama reachability and Qwen 3.5 4B for coding harness evals.
 * @category Evals
 */
export async function ollamaQwenEvalReady(
  profile: OllamaQwenCoderEvalProfile = OLLAMA_QWEN_CODER_15B_EVAL
): Promise<OllamaEvalReadiness> {
  const { id: profileId, model, extensionBinding } = profile
  const baseURL = (extensionBinding?.baseURL as string | undefined) ?? OLLAMA_QWEN_CODER_15B_BASE_URL
  if (!(await ollamaReachable(baseURL))) {
    return {
      ready: false,
      reason: `Ollama not reachable at ${baseURL}`,
      profileId,
      model,
      baseURL,
    }
  }
  if (!(await ollamaHasModel(model!, baseURL))) {
    return {
      ready: false,
      reason: `Model ${model} is not pulled (run: ollama pull ${model})`,
      profileId,
      model,
      baseURL,
    }
  }
  return { ready: true, profileId, model: model!, baseURL }
}
