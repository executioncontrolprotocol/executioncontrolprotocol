import { fal } from "@fal-ai/client"
import type { FalInferenceMode } from "./schemas.js"
import { FAL_INFERENCE_MODES } from "./schemas.js"

/** Result from a FAL inference call. @category Extensions */
export interface FalInferenceResult {
  /** Primary result payload from FAL. */
  data: unknown
  /** FAL request id when available. */
  requestId?: string
}

/** Options for {@link runFalInference}. @category Extensions */
export interface RunFalInferenceOptions {
  /** FAL API key. */
  apiKey: string
  /** FAL model endpoint id. */
  endpoint: string
  /** Model-specific request payload. */
  input: Record<string, unknown>
  /** Inference mode. */
  mode: FalInferenceMode
  /** Include queue logs when using subscribe mode. */
  logs?: boolean
}

/**
 * Run inference against a FAL endpoint using the official client.
 *
 * @category Extensions
 */
export async function runFalInference(options: RunFalInferenceOptions): Promise<FalInferenceResult> {
  const { apiKey, endpoint, input, mode, logs } = options
  fal.config({ credentials: apiKey })

  try {
    if (mode === FAL_INFERENCE_MODES.RUN) {
      const result = await fal.run(endpoint, { input })
      return {
        data: result.data,
        requestId: result.requestId,
      }
    }

    const result = await fal.subscribe(endpoint, {
      input,
      logs: logs ?? false,
    })
    return {
      data: result.data,
      requestId: result.requestId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`FAL API error (${endpoint}): ${message}`)
  }
}
