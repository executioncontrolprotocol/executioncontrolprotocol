import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  type Registry,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { falGenerateInputSchema, falGenerateOutputSchema, FAL_INFERENCE_MODES } from "./schemas.js"
import { resolveFalApiKey } from "./resolve-api-key.js"
import { runFalInference } from "./run-inference.js"
import type { FalInferenceMode } from "./schemas.js"

/** @executioncontrolprotocol/fal extension. @category Extensions */
export const falExtension = defineExtension("@executioncontrolprotocol", "fal")
  .withConfig({
    apiKey: z.string().optional(),
    defaultEndpoint: z.string().optional(),
    defaultMode: z.enum([FAL_INFERENCE_MODES.RUN, FAL_INFERENCE_MODES.SUBSCRIBE]).optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/fal", "generate")
      .withInput(falGenerateInputSchema)
      .withOutput(falGenerateOutputSchema)
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
