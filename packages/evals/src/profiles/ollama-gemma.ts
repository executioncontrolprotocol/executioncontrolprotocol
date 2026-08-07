import type { EvalProviderProfile } from "./eval-provider.js"

/**
 * Baked Ollama + Gemma profile for harness evals (no env overrides).
 * @category Evals
 */
export const OLLAMA_GEMMA_1B_EVAL = {
  id: "ollama-gemma-1b",
  providerId: "@executioncontrolprotocol/ollama",
  generateCapability: "@executioncontrolprotocol/ollama.generate",
  runtime: "node",
  model: "gemma3:1b",
  extensionBinding: {
    baseURL: "http://localhost:11434",
    defaultModel: "gemma3:1b",
    numCtx: 8192,
  },
} as const satisfies EvalProviderProfile

/** @category Evals */
export type OllamaGemmaEvalProfile = typeof OLLAMA_GEMMA_1B_EVAL

/** Default local Ollama API URL (from extension binding). @category Evals */
export const OLLAMA_GEMMA_1B_BASE_URL =
  OLLAMA_GEMMA_1B_EVAL.extensionBinding!.baseURL as string

/** Ollama num_ctx for the Gemma 1B profile. @category Evals */
export const OLLAMA_GEMMA_1B_NUM_CTX = OLLAMA_GEMMA_1B_EVAL.extensionBinding!.numCtx as number
