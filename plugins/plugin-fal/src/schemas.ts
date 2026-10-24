import { z } from "zod"

/** FAL inference mode: direct HTTP or queue-backed polling. @category Extensions */
export const FAL_INFERENCE_MODES = {
  RUN: "run",
  SUBSCRIBE: "subscribe",
} as const

/** FAL inference mode union. @category Extensions */
export type FalInferenceMode = (typeof FAL_INFERENCE_MODES)[keyof typeof FAL_INFERENCE_MODES]

/** Input for {@link "@executioncontrolprotocol/fal.generate"}. @category Extensions */
export const falGenerateInputSchema = z.object({
  /** FAL model endpoint id (e.g. `fal-ai/flux/schnell`). */
  endpoint: z.string().optional(),
  /** Model-specific request payload per FAL API docs. */
  input: z.record(z.string(), z.unknown()),
  /** Inference mode override. */
  mode: z.enum([FAL_INFERENCE_MODES.RUN, FAL_INFERENCE_MODES.SUBSCRIBE]).optional(),
  /** Include queue logs when using subscribe mode. */
  logs: z.boolean().optional(),
})

/** Output from {@link "@executioncontrolprotocol/fal.generate"}. @category Extensions */
export const falGenerateOutputSchema = z.object({
  /** Primary result payload from FAL (images, video urls, metadata, etc.). */
  data: z.unknown(),
  /** FAL request id when available. */
  requestId: z.string().optional(),
})
