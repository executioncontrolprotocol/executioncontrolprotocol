import type { FileRefAccess, XEcpFileAnnotation } from "@executioncontrolprotocol/protocol"
import { z } from "zod"

const mediaType = z.string().optional()

/**
 * Options for {@link fileRefSchema}.
 * @category Plugins
 */
export interface FileRefSchemaOptions {
  /** Declared handler access; omitted means any {@link FileRef} kind. */
  access?: FileRefAccess
  /** Allowed `mediaType` values on the ref (`type/*` wildcards allowed). */
  mediaTypes?: string[]
}

const fileRefUnion = z.discriminatedUnion("kind", [
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

/** Inferred {@link FileRef} from the shared union. */
export type FileRefZod = z.infer<typeof fileRefUnion>

/**
 * Shared zod {@link FileRef} union with optional `x-ecp-file` JSON Schema metadata.
 * @category Plugins
 */
export function fileRefSchema(options: FileRefSchemaOptions = {}): typeof fileRefUnion {
  const annotation: XEcpFileAnnotation = {}
  if (options.access) annotation.access = options.access
  if (options.mediaTypes?.length) annotation.mediaTypes = [...options.mediaTypes]
  return fileRefUnion.meta({ jsonSchema: { "x-ecp-file": annotation } }) as typeof fileRefUnion
}