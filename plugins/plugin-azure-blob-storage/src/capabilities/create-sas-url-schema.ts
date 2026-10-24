import { z } from "zod"
import { SAS_PERMISSION_CHARS } from "../permissions.js"

/** Create-SAS capability input. @category Azure */
export const createSasUrlInputSchema = z.object({
  container: z.string().min(1).optional(),
  blobName: z.string().min(1),
  permissions: z.array(z.enum(SAS_PERMISSION_CHARS)).min(1),
  expiresInSeconds: z.number().int().positive().optional(),
})

/** Create-SAS capability output. @category Azure */
export const createSasUrlOutputSchema = z.object({
  sasUrl: z.string(),
  expiresAt: z.string(),
  permissions: z.string(),
})
