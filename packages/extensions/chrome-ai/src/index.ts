import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  globalRegistry,
  toProviderChatTurns,
  type CapabilityContext,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  modelGenerateInputSchema,
  modelGenerateOutputSchema,
  type ModelGenerateInput,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import {
  assertModelReady,
  getModelInstallState,
  getPreferredCreateOptions,
  readAvailability,
  startModelDownload,
} from "./model-install.js"
import {
  createChromeLanguageModelSession,
  normalizePromptResponse,
  type ChromeLanguageModelApi,
} from "./prompt-session.js"
import { buildChromePromptWithContext } from "./format-model-context.js"

interface ChromeAiGlobal {
  LanguageModel?: ChromeLanguageModelApi
}

function chromeAi(): ChromeLanguageModelApi | undefined {
  return (globalThis as ChromeAiGlobal).LanguageModel
}

async function runChromePrompt(
  input: ModelGenerateInput,
  ctx: CapabilityContext
): Promise<{ text: string }> {
  if (input.files && input.files.length > 0) {
    throw new Error("@executioncontrolprotocol/chrome-ai.generate does not support files yet")
  }
  await assertModelReady()
  const model = chromeAi()
  if (!model?.create) {
    throw new Error("Chrome LanguageModel API is not available")
  }
  ctx.usage.increment({ modelCalls: 1 })
  const preferred = getPreferredCreateOptions()
  const sessionOptions = preferred.kind === "bare" ? {} : preferred.options
  const turns = toProviderChatTurns({
    system: input.system,
    messages: input.messages,
    prompt: input.prompt,
  })
  const systemParts = turns
    .filter((turn) => turn.role === "system")
    .map((turn) => turn.content)
  const prior = turns.slice(0, -1).filter((turn) => turn.role !== "system")
  const current = turns[turns.length - 1]
  const session = await createChromeLanguageModelSession(
    model,
    systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    sessionOptions,
    prior
  )
  // Chrome Prompt API takes a single current-turn string; keep context on that turn.
  const effectivePrompt = buildChromePromptWithContext(
    current?.content ?? input.prompt,
    input.context
  )
  const response = await session.prompt(effectivePrompt)
  return { text: normalizePromptResponse(response) }
}

const InstallStateSchema = z.object({
  phase: z.enum(["idle", "checking", "downloading", "loading", "ready", "error"]),
  status: z
    .enum(["unsupported", "unavailable", "downloadable", "downloading", "available"])
    .optional(),
  loaded: z.number().optional(),
  total: z.number().optional(),
  error: z.string().optional(),
  hint: z.string().optional(),
})

/** Chrome built-in AI provider. @category Extensions */
export const chromeAiExtension = defineExtension("@executioncontrolprotocol", "chrome-ai")
  .withSupportedRuntimes(["@executioncontrolprotocol/browser"])
  .withMetadata({
    summary: "On-device language model for Chrome browsers.",
    description:
      "Binds Chrome built-in AI for text generation and on-device model install lifecycle. Runs only in browser environments that expose the LanguageModel API.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/chrome-ai", "checkAvailability")
      .withInput(z.object({}))
      .withOutput(
        z.object({
          available: z.boolean(),
          supported: z.boolean(),
          status: z.string().optional(),
        })
      )
      .withMetadata({
        summary: "Check whether the on-device language model is supported and ready.",
        description:
          "Probes the browser for Chrome LanguageModel support and current availability. Use before generate or download steps to decide whether to prompt the user to install the model or fall back to another path.",
        useCases: [
          "First-run browser demo needs to know if on-device AI is available.",
          "Workflow step gates model calls until availability is confirmed.",
        ],
        samplePrompts: [
          "Is the on-device model available in this browser?",
          "Check Chrome AI availability before running chat.",
        ],
      })
      .withHandler(async () => {
        const result = await readAvailability()
        return {
          available: result.available,
          supported: result.supported,
          status: result.status,
        }
      }),
    capabilityFor("@executioncontrolprotocol/chrome-ai", "startModelDownload")
      .withInput(z.object({}))
      .withOutput(z.object({ started: z.boolean() }))
      .withMetadata({
        summary: "Start downloading the on-device language model.",
        description:
          "Triggers a one-time model download when Chrome reports the model as downloadable. Use after checkAvailability shows the model is not yet installed.",
        useCases: [
          "User opts in to on-device AI during first-run setup.",
          "App retries download after a previous install was interrupted.",
        ],
        samplePrompts: [
          "Download the Chrome on-device model.",
          "Start Gemini Nano install for this session.",
        ],
      })
      .withHandler(async () => startModelDownload()),
    capabilityFor("@executioncontrolprotocol/chrome-ai", "getModelInstallState")
      .withInput(z.object({}))
      .withOutput(InstallStateSchema)
      .withMetadata({
        summary: "Poll on-device model download and load progress.",
        description:
          "Returns install phase, byte progress when downloading, and error hints. Use to drive progress UI or block generate until the model reaches ready.",
        useCases: [
          "Show a progress toast while the model downloads.",
          "Wait loop before invoking generate on first launch.",
        ],
        samplePrompts: [
          "What is the model install progress?",
          "Is the on-device model still downloading?",
        ],
      })
      .withHandler(async () => getModelInstallState()),
    capabilityFor("@executioncontrolprotocol/chrome-ai", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withMetadata({
        summary: "Generate text with Chrome on-device AI.",
        description:
          "Runs chat-style text generation entirely on-device via the Chrome LanguageModel API. Best for privacy-sensitive or offline-friendly browser apps. Requires the on-device model to be downloaded and ready. Does not accept file attachments yet.",
        useCases: [
          "Browser chat harness needs a local model with no network round trip.",
          "Workflow step summarizes user input without sending data off-device.",
        ],
        samplePrompts: [
          "Answer this question using on-device AI.",
          "Generate a short reply for the chat panel.",
        ],
      })
      .withHandler(async (raw, ctx) =>
        runChromePrompt(modelGenerateInputSchema.parse(raw), ctx)
      ),
  ])
  .build()

catalogExtension(chromeAiExtension)

export type {
  ChromeAvailabilityStatus,
  ChromeModelInstallPhase,
  ChromeModelInstallState,
  ChromeModelStallCheckInput,
  PreferredChromeCreateOptions,
} from "./model-install.js"
export {
  assertModelReady,
  CHROME_MODEL_STALL_HINT,
  CHROME_MODEL_STALL_MS,
  getModelInstallState,
  getPreferredCreateOptions,
  isChromeModelInstallStalled,
  readAvailability,
  resetModelInstallState,
  startModelDownload,
} from "./model-install.js"

/** Register Chrome AI extension. @category Extensions */
export async function registerChromeAiExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/chrome-ai")) {
    await registry.registerExtension(chromeAiExtension)
  }
}
