import { z } from "zod"

/** Upload capability input. @category Azure */
export const uploadInputSchema = z
  .object({
    container: z.string().min(1).optional(),
    blobName: z.string().min(1).optional(),
    contentType: z.string().min(1).optional(),
    contentBase64: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    filePath: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    createReadSas: z.boolean().optional(),
    sasExpiresInSeconds: z.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    const sources = [val.contentBase64, val.sourceUrl, val.filePath, val.source].filter(Boolean)
    if (sources.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of contentBase64, sourceUrl, filePath, or source",
      })
    }
  })

/** Upload capability output. @category Azure */
export const uploadOutputSchema = z.object({
  container: z.string(),
  blobName: z.string(),
  blobUrl: z.string(),
  contentType: z.string(),
  etag: z.string().optional(),
  sasUrl: z.string().optional(),
})
