import { CHROME_NANO_EVAL } from "../profiles/chrome-nano.js"

/** @category Evals */
export type ChromeNanoEvalReadiness = {
  ready: boolean
  reason?: string
  profileId: string
}

interface ChromeLanguageModelGlobal {
  LanguageModel?: {
    availability(): Promise<string>
  }
}

function languageModelApi(): ChromeLanguageModelGlobal["LanguageModel"] | undefined {
  return (globalThis as ChromeLanguageModelGlobal).LanguageModel
}

/**
 * Whether Chrome built-in AI (LanguageModel / Nano) is available for eval tests.
 * @category Evals
 */
export async function chromeNanoEvalReady(
  profile = CHROME_NANO_EVAL
): Promise<ChromeNanoEvalReadiness> {
  const profileId = profile.id
  const api = languageModelApi()
  if (!api?.availability) {
    return {
      ready: false,
      reason: "Chrome LanguageModel API is not available in this browser",
      profileId,
    }
  }
  try {
    const status = await api.availability()
    if (status === "available" || status === "readily") {
      return { ready: true, profileId }
    }
    return {
      ready: false,
      reason: `Chrome on-device model status: ${status} (download Gemini Nano in chrome://on-device-internals or Chrome AI settings)`,
      profileId,
    }
  } catch (err) {
    return {
      ready: false,
      reason: err instanceof Error ? err.message : String(err),
      profileId,
    }
  }
}
