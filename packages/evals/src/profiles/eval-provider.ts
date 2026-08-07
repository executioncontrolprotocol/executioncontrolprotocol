/**
 * Swappable eval model provider — harness logic stays fixed; only env binding changes.
 * @category Evals
 */
export type EvalProviderProfile = {
  /** Profile id for logging and readiness (e.g. ollama-gemma-1b, chrome-nano). */
  id: string
  /** Provider extension id (e.g. @executioncontrolprotocol/ollama, @executioncontrolprotocol/chrome-ai). */
  providerId: string
  /** Generate capability invoked by the harness (e.g. @executioncontrolprotocol/ollama.generate). */
  generateCapability: string
  /** ECP runtime required for this provider. */
  runtime: "node" | "browser"
  /** Model tag when the provider supports it (Ollama); omit for on-device Chrome Nano. */
  model?: string
  /** Extension `.with({ ... })` config passed at environment bind time. */
  extensionBinding?: Record<string, unknown>
}
