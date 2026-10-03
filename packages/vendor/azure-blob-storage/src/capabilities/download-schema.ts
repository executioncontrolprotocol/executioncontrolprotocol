import { z } from "zod"
import { fileRefSchema } from "@executioncontrolprotocol/types"

/** Download capability input. @category Azure */
export const downloadInputSchema = z.object({
  container: z.string().min(1).optional(),
  blobName: z.string().min(1),
})

/** Download capability output. @category Azure */
export const downloadOutputSchema = z.object({
  /** Artifact {@link FileRef} written via core {@link writeMediaArtifact}. */
  file: fileRefSchema(),
  contentType: z.string(),
  blobName: z.string(),
})
