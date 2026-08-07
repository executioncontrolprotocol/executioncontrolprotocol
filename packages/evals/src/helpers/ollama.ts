import { OLLAMA_GEMMA_1B_BASE_URL, OLLAMA_GEMMA_1B_EVAL, type OllamaGemmaEvalProfile } from "../profiles/ollama-gemma.js"

/** @category Evals */
export type OllamaEvalReadiness = {
  /** Whether eval tests should run. */
  ready: boolean
  /** Skip reason when not ready. */
  reason?: string
  /** Profile id. */
  profileId: string
  /** Pinned model tag. */
  model: string
  /** Pinned base URL. */
  baseURL: string
}

/**
 * Whether Ollama HTTP API is reachable at the profile base URL.
 * @category Evals
 */
export async function ollamaReachable(
  baseURL: string = OLLAMA_GEMMA_1B_BASE_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Whether a model tag is available in the local Ollama instance.
 * @category Evals
 */
export async function ollamaHasModel(
  model: string,
  baseURL: string = OLLAMA_GEMMA_1B_BASE_URL
): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { models?: Array<{ name?: string }> }
    const names = (body.models ?? []).map((m) => m.name ?? "")
    return names.some((name) => name === model || name.startsWith(`${model}:`))
  } catch {
    return false
  }
}

/**
 * Check Ollama reachability and model availability for a baked eval profile.
 * @category Evals
 */
export async function ollamaEvalReady(
  profile: OllamaGemmaEvalProfile = OLLAMA_GEMMA_1B_EVAL
): Promise<OllamaEvalReadiness> {
  const { id: profileId, model, extensionBinding } = profile
  const baseURL = (extensionBinding?.baseURL as string | undefined) ?? OLLAMA_GEMMA_1B_BASE_URL
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

/** Default Gemma 1B workflow eval profile. @category Evals */
export { OLLAMA_GEMMA_1B_EVAL }
