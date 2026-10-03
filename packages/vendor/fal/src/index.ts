import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  type Registry,
  NODE_RUNTIME_ID,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { falGenerateInputSchema, falGenerateOutputSchema, FAL_INFERENCE_MODES } from "./schemas.js"
import { resolveFalApiKey } from "./resolve-api-key.js"
import { runFalInference } from "./run-inference.js"
import type { FalInferenceMode } from "./schemas.js"

/** @executioncontrolprotocol/fal extension. @category Extensions */
export const falExtension = defineExtension("@executioncontrolprotocol", "fal")
  .withSupportedRuntimes([NODE_RUNTIME_ID])
  .withMetadata({
    summary: "Run inference on FAL-hosted generative models",
    description:
      "Calls FAL model endpoints for image, video, audio, and other generative tasks. Supports direct run and queue-backed subscribe modes with configurable default endpoint and API key binding.",
    useCases: [
      "Generate images or video from a FAL model endpoint",
      "Run queued inference jobs with optional progress logs",
    ],
    samplePrompts: [
      "Generate an image with flux schnell on FAL",
      "Run this FAL endpoint with the provided prompt payload",
    ],
  })
  .withConfig({
    apiKey: z.string().optional(),
    defaultEndpoint: z.string().optional(),
    defaultMode: z.enum([FAL_INFERENCE_MODES.RUN, FAL_INFERENCE_MODES.SUBSCRIBE]).optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/fal", "generate")
      .withInput(falGenerateInputSchema)
      .withOutput(falGenerateOutputSchema)
      .withMetadata({
        summary: "Run a FAL model endpoint with a model-specific payload",
        description:
          "Invokes a FAL-hosted model by endpoint id using either a direct run or a subscribe flow that polls until completion. Returns the model result payload and optional request id.",
        useCases: [
          "Text-to-image or image-to-image generation on FAL",
          "Long-running FAL jobs that need queue polling",
        ],
        samplePrompts: [
          "Generate an image from this prompt using fal-ai/flux/schnell",
          "Run the FAL endpoint and wait for the finished result",
        ],
      })
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof falGenerateInputSchema>
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = resolveFalApiKey(cfg)
        if (!apiKey) throw new Error("FAL API key required")

        const endpoint = parsed.endpoint ?? (cfg.defaultEndpoint as string | undefined)
        if (!endpoint) throw new Error("FAL endpoint required")

        const mode =
          parsed.mode ??
          (cfg.defaultMode as FalInferenceMode | undefined) ??
          FAL_INFERENCE_MODES.SUBSCRIBE

        ctx.usage.increment({ modelCalls: 1 })

        return runFalInference({
          apiKey,
          endpoint,
          input: parsed.input,
          mode,
          logs: parsed.logs,
        })
      }),
  ])
  .build()

catalogExtension(falExtension)

/** Register @executioncontrolprotocol/fal. */
export async function registerFalExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/fal")) {
    await registry.registerExtension(falExtension)
  }
}

export { falGenerateInputSchema, falGenerateOutputSchema, FAL_INFERENCE_MODES } from "./schemas.js"
export { resolveFalApiKey } from "./resolve-api-key.js"
export { runFalInference } from "./run-inference.js"

export default falExtension
