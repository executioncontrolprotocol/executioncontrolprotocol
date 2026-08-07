import { z } from "zod"

const bindingSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  order: z.number().int().nonnegative(),
  config: z.record(z.unknown()).optional(),
})

/** Zod schema for `@executioncontrolprotocol.environment` manifests. */
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

const eqlTypesSchema = z.record(z.string())

/** Zod schema for `@executioncontrolprotocol.environment.describe` documents. */
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
      inputSchema: z.union([eqlTypesSchema, z.record(z.unknown())]).optional(),
      outputSchema: z.union([eqlTypesSchema, z.record(z.unknown())]).optional(),
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

export function isEqlTypesRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "string")
}
