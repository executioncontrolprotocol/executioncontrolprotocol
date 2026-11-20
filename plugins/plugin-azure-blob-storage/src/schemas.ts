import { z } from "zod"

/**
 * SAS lifetime when the input doesn't set `expiresInSeconds`.
 * @category Plugins
 */
export const DEFAULT_SAS_EXPIRES_IN_SECONDS = 3600

/**
 * SAS permissions when the input doesn't set `permissions` (read only).
 * @category Plugins
 */
export const DEFAULT_SAS_PERMISSIONS = "r"

const defaultContainer = z.string().min(1).optional()

/**
 * Plugin config: a connection string, or an account name and key. Either may name a default container.
 * @category Plugins
 */
export const azureBlobConfigSchema = z.union([
  z.object({ connectionString: z.string().min(1), defaultContainer }),
  z.object({ accountName: z.string().min(1), accountKey: z.string().min(1), defaultContainer }),
])

/**
 * Parsed plugin config.
 * @category Plugins
 */
export type AzureBlobConfig = z.infer<typeof azureBlobConfigSchema>

const mediaType = z.string().optional()

/**
 * Portable file reference: an absolute local path, a URL or a run artifact.
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
 * Artifact reference returned by `download`.
 * @category Plugins
 */
export const artifactRefSchema = z.object({
  kind: z.literal("artifact"),
  uri: z.string(),
  mediaType: z.string().optional(),
  name: z.string().optional(),
  sizeBytes: z.number().optional(),
})

const container = z.string().min(1).optional()
const blobName = z.string().min(1)

/**
 * Input of the `upload` capability.
 * @category Plugins
 */
export const uploadAcceptsSchema = z.object({
  file: fileRefSchema,
  blobName: blobName.optional(),
  container,
  createReadSas: z.boolean().optional(),
  contentType: z.string().optional(),
})

/**
 * Output of the `upload` capability.
 * @category Plugins
 */
export const uploadReturnsSchema = z.object({
  blobName: z.string(),
  container: z.string(),
  blobUrl: z.string(),
  sasUrl: z.string().optional(),
})

/**
 * Input of the `download` capability.
 * @category Plugins
 */
export const downloadAcceptsSchema = z.object({
  blobName,
  container,
})

/**
 * Output of the `download` capability.
 * @category Plugins
 */
export const downloadReturnsSchema = z.object({
  file: artifactRefSchema,
})

/**
 * Input of the `sas` capability.
 * @category Plugins
 */
export const sasAcceptsSchema = z.object({
  blobName,
  container,
  permissions: z
    .string()
    .regex(/^[racwd]+$/, "Use permission letters r (read), a (add), c (create), w (write), d (delete).")
    .optional(),
  expiresInSeconds: z.number().int().positive().optional(),
})

/**
 * Output of the `sas` capability.
 * @category Plugins
 */
export const sasReturnsSchema = z.object({
  sasUrl: z.string(),
  expiresOn: z.string(),
})

/**
 * Input of the `delete` capability.
 * @category Plugins
 */
export const deleteAcceptsSchema = z.object({
  blobName,
  container,
  ifMissing: z.enum(["error", "ignore"]).default("error"),
})

/**
 * Output of the `delete` capability.
 * @category Plugins
 */
export const deleteReturnsSchema = z.object({
  blobName: z.string(),
  container: z.string(),
  deleted: z.boolean(),
})

/**
 * Typed input of `upload`.
 * @category Plugins
 */
export type UploadInput = z.infer<typeof uploadAcceptsSchema>

/**
 * Typed output of `upload`.
 * @category Plugins
 */
export type UploadOutput = z.infer<typeof uploadReturnsSchema>

/**
 * Typed input of `download`.
 * @category Plugins
 */
export type DownloadInput = z.infer<typeof downloadAcceptsSchema>

/**
 * Typed output of `download`.
 * @category Plugins
 */
export type DownloadOutput = z.infer<typeof downloadReturnsSchema>

/**
 * Typed input of `sas`.
 * @category Plugins
 */
export type SasInput = z.infer<typeof sasAcceptsSchema>

/**
 * Typed output of `sas`.
 * @category Plugins
 */
export type SasOutput = z.infer<typeof sasReturnsSchema>

/**
 * Typed input of `delete`.
 * @category Plugins
 */
export type DeleteInput = z.input<typeof deleteAcceptsSchema>

/**
 * Typed output of `delete`.
 * @category Plugins
 */
export type DeleteOutput = z.infer<typeof deleteReturnsSchema>
