import { z } from "zod"

const mediaType = z.string().optional()

/**
 * Portable file reference accepted by Adobe Firefly Services capabilities (url only at runtime).
 * @category Plugins
 */
export const fileRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), path: z.string().min(1), mediaType }),
  z.object({
    kind: z.literal("url"),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    mediaType,
  }),
  z.object({
    kind: z.literal("artifact"),
    uri: z.string().min(1),
    mediaType,
    name: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
])

/**
 * Parsed {@link fileRefSchema} value.
 * @category Plugins
 */
export type FileRef = z.infer<typeof fileRefSchema>