import {
  ecpPatchDocumentSchema,
  validateWorkflow,
  zodIssuesToValidationIssues,
} from "@executioncontrolprotocol/core"
import type { EcpSchema, ValidationIssue, ValidationResult } from "@executioncontrolprotocol/types"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import { z } from "zod"

const bindingSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  order: z.number().int().nonnegative(),
  config: z.record(z.unknown()).optional(),
})

/** Zod schema for `@executioncontrolprotocol.environment` manifests. @category Encoding */
export const environmentManifestSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.environment"),
  version: z.string(),
  environment: z.object({
    id: z.string().min(1),
    label: z.string().optional(),
  }),
  runtime: z
    .object({
      id: z.string().min(1),
      label: z.string().optional(),
      config: z.record(z.unknown()).optional(),
    })
    .optional(),
  extensions: z.array(bindingSchema).optional(),
  policies: z.array(bindingSchema).optional(),
})

const runtimeFeaturesSchema = z.object({
  durableExecution: z.boolean().optional(),
  loops: z.boolean().optional(),
  parallel: z.boolean().optional(),
  branches: z.boolean().optional(),
  pauses: z.boolean().optional(),
  cancellation: z.boolean().optional(),
  longRunningWorkflows: z.boolean().optional(),
})

/** Zod schema for `@executioncontrolprotocol.environment.describe` documents. @category Encoding */
export const environmentDescribeSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.environment.describe"),
  version: z.string(),
  environment: z.object({
    id: z.string().min(1),
    label: z.string().optional(),
  }),
  runtime: z.object({
    id: z.string().min(1),
    label: z.string().optional(),
    features: runtimeFeaturesSchema,
  }),
  extensions: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().optional(),
      order: z.number().int().nonnegative(),
      configSchema: z.unknown().optional(),
      capabilities: z.array(z.string()),
    })
  ),
  capabilities: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().optional(),
      extension: z.string().min(1),
      inputSchema: z.unknown().optional(),
      outputSchema: z.unknown().optional(),
      examples: z.array(z.unknown()).optional(),
    })
  ),
  policies: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().optional(),
      summary: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      configSchema: z.unknown().optional(),
    })
  ),
})

/** Zod schema for `@executioncontrolprotocol.environment.search` documents. @category Encoding */
export const environmentSearchSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.environment.search"),
  version: z.string(),
  results: z.array(
    z.object({
      type: z.string().min(1),
      id: z.string().min(1),
      label: z.string().optional(),
      score: z.number(),
      reason: z.string().optional(),
      inputSchema: z.unknown().optional(),
      outputSchema: z.unknown().optional(),
    })
  ),
})

/** Schemas that receive optional structural validation after TOON decode. @category Encoding */
export const TOON_VALIDATED_ECP_SCHEMAS = [
  "@executioncontrolprotocol.workflow",
  "@executioncontrolprotocol.environment",
  "@executioncontrolprotocol.environment.describe",
  "@executioncontrolprotocol.environment.search",
  "@executioncontrolprotocol.patch",
] as const satisfies readonly EcpSchema[]

/** Union of schemas with built-in TOON validation. @category Encoding */
export type ToonValidatedEcpSchema = (typeof TOON_VALIDATED_ECP_SCHEMAS)[number]

function emptyValidation(valid: boolean): ValidationResult {
  return {
    schema: "@executioncontrolprotocol.validation.result",
    version: LATEST_ECP_VERSION,
    valid,
    errors: [],
    warnings: [],
  }
}

function zodToResult(parsed: z.SafeParseReturnType<unknown, unknown>): ValidationResult {
  if (parsed.success) return emptyValidation(true)
  const result = emptyValidation(false)
  result.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
  return result
}

/**
 * Validate a decoded document when its schema is known to ECP.
 * Unknown schemas return valid with no diagnostics (schema-agnostic TOON).
 * @category Encoding
 */
export function validateEcpDocument(
  document: unknown,
  schema?: EcpSchema | string
): ValidationResult {
  const resolved =
    schema ??
    (document !== null &&
    typeof document === "object" &&
    "schema" in document &&
    typeof (document as { schema: unknown }).schema === "string"
      ? ((document as { schema: string }).schema as EcpSchema)
      : undefined)

  if (!resolved || !TOON_VALIDATED_ECP_SCHEMAS.includes(resolved as ToonValidatedEcpSchema)) {
    return emptyValidation(true)
  }

  switch (resolved) {
    case "@executioncontrolprotocol.workflow":
      return validateWorkflow(document as import("@executioncontrolprotocol/types").WorkflowManifest)
    case "@executioncontrolprotocol.environment":
      return zodToResult(environmentManifestSchema.safeParse(document))
    case "@executioncontrolprotocol.environment.describe":
      return zodToResult(environmentDescribeSchema.safeParse(document))
    case "@executioncontrolprotocol.environment.search":
      return zodToResult(environmentSearchSchema.safeParse(document))
    case "@executioncontrolprotocol.patch":
      return zodToResult(ecpPatchDocumentSchema.safeParse(document))
    default:
      return emptyValidation(true)
  }
}

/**
 * Merge validation issues into a diagnostics list.
 * @category Encoding
 */
export function validationToDiagnostics(validation: ValidationResult): ValidationIssue[] {
  return [...validation.errors, ...validation.warnings]
}
