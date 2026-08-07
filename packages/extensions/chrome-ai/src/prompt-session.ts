const CHROME_TEXT_LANGUAGE = "en"

export const CHROME_LANGUAGE_MODEL_TEXT_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: [CHROME_TEXT_LANGUAGE] }],
  expectedOutputs: [{ type: "text" as const, languages: [CHROME_TEXT_LANGUAGE] }],
}

interface ChromePromptMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChromeLanguageModelSession {
  prompt(input: string): Promise<unknown>
}

interface ChromeLanguageModelCreateOptions {
  initialPrompts?: ChromePromptMessage[]
  expectedInputs?: Array<{ type: "text"; languages: string[] }>
  expectedOutputs?: Array<{ type: "text"; languages: string[] }>
  monitor?: (monitor: {
    addEventListener(
      type: "downloadprogress",
      listener: (event: { loaded: number; total?: number }) => void
    ): void
  }) => void
}

export interface ChromeLanguageModelApi {
  availability(options?: ChromeLanguageModelCreateOptions): Promise<string>
  create(options?: ChromeLanguageModelCreateOptions): Promise<ChromeLanguageModelSession>
}

/** Normalize Prompt API output (string or legacy `{ text }` shape). */
export function normalizePromptResponse(response: unknown): string {
  if (typeof response === "string") return response
  if (response !== null && typeof response === "object") {
    if ("text" in response && typeof (response as { text: unknown }).text === "string") {
      return (response as { text: string }).text
    }
    if ("content" in response && typeof (response as { content: unknown }).content === "string") {
      return (response as { content: string }).content
    }
  }
  throw new Error("Chrome LanguageModel prompt returned an unsupported response shape")
}

const DEFAULT_SESSION_OPTIONS: Pick<
  ChromeLanguageModelCreateOptions,
  "expectedInputs" | "expectedOutputs"
> = CHROME_LANGUAGE_MODEL_TEXT_OPTIONS

/** Create a Prompt API session with optional system instruction. */
export async function createChromeLanguageModelSession(
  model: ChromeLanguageModelApi,
  system?: string
): Promise<ChromeLanguageModelSession> {
  const options: ChromeLanguageModelCreateOptions = { ...DEFAULT_SESSION_OPTIONS }
  if (system?.trim()) {
    options.initialPrompts = [{ role: "system", content: system }]
  }
  if (model.availability) {
    await model.availability(options)
  }
  return model.create(options)
}
