import type { EvalProviderProfile } from "./eval-provider.js"
import { OLLAMA_GEMMA_1B_EVAL } from "./ollama-gemma.js"

let activeEvalProvider: EvalProviderProfile = OLLAMA_GEMMA_1B_EVAL

/** Active provider for {@link resolveEvalModel} and judge gating. @category Evals */
export function getActiveEvalProvider(): EvalProviderProfile {
  return activeEvalProvider
}

/** Set active provider (call at top of provider-specific eval test files). @category Evals */
export function setActiveEvalProvider(profile: EvalProviderProfile): void {
  activeEvalProvider = profile
}

/** Reset to default Ollama profile (for unit tests). @category Evals */
export function resetActiveEvalProvider(): void {
  activeEvalProvider = OLLAMA_GEMMA_1B_EVAL
}
