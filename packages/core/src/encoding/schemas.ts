import { z } from "zod"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"

const validationIssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  path: z.string().optional(),
  code: z.string().optional(),
})

const validationResultSchema = z
  .object({
    schema: z.literal("@executioncontrolprotocol.validation.result"),
    version: z.string(),
    valid: z.boolean(),
    errors: z.array(validationIssueSchema),
    warnings: z.array(validationIssueSchema),
  })
  .optional()

/** Zod schema for encode capability input. @category Encoding */
export const ecpEncodeInputSchema = z.object({
  source: z.unknown(),
  sourceSchema: z.string().optional(),
  sourceVersion: z.string().optional(),
  format: z.string().optional(),
  options: z
    .object({
      headers: z.boolean().optional(),
      compact: z.boolean().optional(),
      include: z.array(z.string()).optional(),
      as: z.enum(["object", "string"]).optional(),
    })
    .passthrough()
    .optional(),
})

/** Zod schema for decode capability input. @category Encoding */
export const ecpDecodeInputSchema = z.object({
  input: z.unknown(),
  format: z.string().optional(),
  targetSchema: z.string().optional(),
  targetVersion: z.string().optional(),
  options: z
    .object({
      strict: z.boolean().optional(),
      headers: z.union([z.boolean(), z.literal("auto")]).optional(),
    })
    .passthrough()
    .optional(),
})

/** Zod schema for encode result output. @category Encoding */
export const ecpEncodeResultSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.encode.result"),
  version: z.string(),
  success: z.boolean(),
  format: z.string(),
  mediaType: z.string().optional(),
  sourceSchema: z.string().optional(),
  sourceVersion: z.string().optional(),
  result: z.unknown().optional(),
  validation: validationResultSchema,
  diagnostics: z.array(validationIssueSchema),
})

/** Zod schema for decode result output. @category Encoding */
export const ecpDecodeResultSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.decode.result"),
  version: z.string(),
  success: z.boolean(),
  targetSchema: z.string().optional(),
  targetVersion: z.string().optional(),
  result: z.unknown().optional(),
  validation: validationResultSchema,
  diagnostics: z.array(validationIssueSchema),
})

/** Default encoded version field. @category Encoding */
export const ENCODED_VERSION = LATEST_ECP_VERSION
