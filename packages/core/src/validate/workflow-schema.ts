import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import { z } from "zod"

/** Capability id pattern: `@namespace/name.capability`. @category Validation */
export const capabilityIdSchema = z
  .string()
  .min(1)
  .regex(/^@[^/]+\/[^.]+\.[^.]+$/, "Expected capability id (@namespace/name.capability)")

/** Commit mode for step output. @category Validation */
export const commitModeSchema = z.enum(["create", "replace", "merge", "append", "version"])

/** Reference to committed workflow state. @category Validation */
export const refValueSchema = z
  .object({
    $ref: z.string().min(1),
    optional: z.boolean().optional(),
    fallback: z.unknown().optional(),
  })
  .strict()

/** Mutable state handle in step input (includes fluent `state()` authoring fields). @category Validation */
export const stateValueSchema = z
  .object({
    $state: z.string().min(1),
    path: z.string().min(1).optional(),
    __brand: z.unknown().optional(),
    optional: z.boolean().optional(),
    fallback: z.unknown().optional(),
  })
  .strict()

/** Environment secret reference (not portable in workflows). @category Validation */
export const envValueSchema = z
  .object({
    $env: z.string().min(1),
    optional: z.boolean().optional(),
    fallback: z.unknown().optional(),
  })
  .strict()

/** OS secrets reference (not portable in workflows). @category Validation */
export const secretValueSchema = z
  .object({
    $secret: z.string().min(1),
    optional: z.boolean().optional(),
    fallback: z.unknown().optional(),
  })
  .strict()

/** Browser encrypted secrets reference (not portable in workflows). @category Validation */
export const browserValueSchema = z
  .object({
    $browser: z.string().min(1),
    optional: z.boolean().optional(),
    fallback: z.unknown().optional(),
  })
  .strict()

/** Recursive step input value. @category Validation */
export const inputValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(inputValueSchema),
    z.record(inputValueSchema),
    refValueSchema,
    stateValueSchema,
    envValueSchema,
    secretValueSchema,
    browserValueSchema,
  ])
)

/** Expression value for step/branch conditions. @category Validation */
export const exprValueSchema = z.union([
  z.object({ eq: z.tuple([z.string(), z.unknown()]) }).strict(),
  z.object({ neq: z.tuple([z.string(), z.unknown()]) }).strict(),
  z.record(z.unknown()),
])

/** Single capability step node. @category Validation */
export const stepNodeSchema = z
  .object({
    type: z.literal("step").optional(),
    id: z.string().min(1),
    label: z.string().optional(),
    uses: capabilityIdSchema,
    input: z.record(inputValueSchema).optional(),
    as: z.string().min(1).optional(),
    mode: commitModeSchema.optional(),
    when: exprValueSchema.optional(),
  })
  .strict()

/** Parallel branches node. @category Validation */
export const parallelNodeSchema = z
  .object({
    type: z.literal("parallel"),
    id: z.string().min(1),
    label: z.string().optional(),
    branches: z.array(z.array(z.lazy(() => workflowNodeSchema))).min(1),
  })
  .strict()

/** Conditional branch arm. @category Validation */
export const branchArmSchema = z
  .object({
    label: z.string().optional(),
    when: exprValueSchema,
    steps: z.array(z.lazy(() => workflowNodeSchema)).min(0),
  })
  .strict()

/** Conditional branches node. @category Validation */
export const branchNodeSchema = z
  .object({
    type: z.literal("branch"),
    id: z.string().min(1),
    label: z.string().optional(),
    branches: z.array(branchArmSchema).min(1),
  })
  .strict()

/** Loop node. @category Validation */
export const loopNodeSchema = z
  .object({
    type: z.literal("loop"),
    id: z.string().min(1),
    label: z.string().optional(),
    until: exprValueSchema.optional(),
    maxRounds: z.number().int().positive().optional(),
    steps: z.array(z.lazy(() => workflowNodeSchema)).min(0),
  })
  .strict()

/** Workflow graph node union. @category Validation */
export const workflowNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([parallelNodeSchema, branchNodeSchema, loopNodeSchema, stepNodeSchema])
)

/** Zod schema for `@executioncontrolprotocol.workflow` manifests. @category Validation */
export const workflowManifestSchema = z
  .object({
    schema: z.literal("@executioncontrolprotocol.workflow"),
    version: z.string().min(1),
    workflow: z
      .object({
        id: z.string().min(1),
        label: z.string().optional(),
      })
      .strict(),
    steps: z.array(workflowNodeSchema),
  })
  .strict()

/** Parsed workflow manifest (inferred from {@link workflowManifestSchema}). @category Validation */
export type ParsedWorkflowManifest = z.infer<typeof workflowManifestSchema>

/** Parsed workflow graph node. @category Validation */
export type ParsedWorkflowNode = z.infer<typeof workflowNodeSchema>

/** Parsed step node. @category Validation */
export type ParsedStepNode = z.infer<typeof stepNodeSchema>

/** Parse and validate a workflow manifest; throws {@link z.ZodError} on failure. @category Validation */
export function parseWorkflowManifest(manifest: unknown): ParsedWorkflowManifest {
  return workflowManifestSchema.parse(manifest)
}

/** Empty validation result template. */
export function emptyValidationResult(valid: boolean): import("@executioncontrolprotocol/types").ValidationResult {
  return {
    schema: "@executioncontrolprotocol.validation.result",
    version: LATEST_ECP_VERSION,
    valid,
    errors: [],
    warnings: [],
  }
}
