import type { EvalProviderProfile } from "./eval-provider.js"

/**
 * Baked Ollama + Qwen 2.5 Coder 1.5B profile for Browser Coding harness evals.
 * @category Evals
 */
export const OLLAMA_QWEN_CODER_15B_EVAL = {
  id: "ollama-qwen-coder-1.5b",
  providerId: "@executioncontrolprotocol/ollama",
  generateCapability: "@executioncontrolprotocol/ollama.generate",
  runtime: "node",
  model: "qwen2.5-coder:1.5b",
  extensionBinding: {
    baseURL: "http://localhost:11434",
    defaultModel: "qwen2.5-coder:1.5b",
    numCtx: 8192,
  },
} as const satisfies EvalProviderProfile

/** @category Evals */
export type OllamaQwenCoderEvalProfile = typeof OLLAMA_QWEN_CODER_15B_EVAL

/** Default local Ollama API URL for Qwen Coder profile. @category Evals */
export const OLLAMA_QWEN_CODER_15B_BASE_URL =
  OLLAMA_QWEN_CODER_15B_EVAL.extensionBinding!.baseURL as string

/** Ollama num_ctx for the Qwen Coder 1.5B profile. @category Evals */
export const OLLAMA_QWEN_CODER_15B_NUM_CTX =
  OLLAMA_QWEN_CODER_15B_EVAL.extensionBinding!.numCtx as number
