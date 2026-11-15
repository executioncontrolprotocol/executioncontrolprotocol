import { z } from "zod"

/** Zod schema for patch entries. @category Patch */
export const ecpPatchEntrySchema = z.object({
  path: z.string().min(1),
  mode: z.enum(["merge", "replace"]).optional(),
  value: z.unknown(),
  reason: z.string().optional(),
})

/** Zod schema for canonical patch documents. @category Patch */
export const ecpPatchDocumentSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.patch"),
  version: z.string(),
  targetSchema: z.string(),
  patches: z.array(ecpPatchEntrySchema).min(1),
})
