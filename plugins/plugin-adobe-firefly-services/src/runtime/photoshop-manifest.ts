/**
 * Photoshop generate-manifest request defaults + passthrough result schema.
 * The capability returns Adobe's raw async `result` (no reshape).
 * @category Runtime
 */
import { z } from "zod"

/**
 * Passthrough schema for Adobe async job `result` bodies (e.g. generate-manifest).
 * Preserves nested `outputs[].destination.content` for author `ref()` paths.
 * @category Runtime
 */
export const adobeAsyncResultPassthroughSchema: z.ZodTypeAny = z.object({}).passthrough()

/**
 * Default generate-manifest output: embedded JSON so callers only need `image`.
 * @category Runtime
 */
export const DEFAULT_PHOTOSHOP_MANIFEST_OUTPUTS = [
  {
    destination: { embedded: "json" as const },
    mediaType: "application/json",
  },
]

/**
 * Fill `outputs` with {@link DEFAULT_PHOTOSHOP_MANIFEST_OUTPUTS} when omitted or empty
 * so a “read layers” call only needs `image`.
 * @category Runtime
 */
export function withDefaultManifestOutputs(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const outputs = input.outputs
  if (Array.isArray(outputs) && outputs.length > 0) return input

  const next: Record<string, unknown> = {
    ...input,
    outputs: DEFAULT_PHOTOSHOP_MANIFEST_OUTPUTS.map((entry) => ({
      destination: { ...entry.destination },
      mediaType: entry.mediaType,
    })),
  }

  const body = input.body
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const bodyRecord = body as Record<string, unknown>
    const bodyOutputs = bodyRecord.outputs
    if (!Array.isArray(bodyOutputs) || bodyOutputs.length === 0) {
      next.body = {
        ...bodyRecord,
        outputs: DEFAULT_PHOTOSHOP_MANIFEST_OUTPUTS.map((entry) => ({
          destination: { ...entry.destination },
          mediaType: entry.mediaType,
        })),
      }
    }
  }

  return next
}
