import { z } from "zod"

/**
 * Top-level field names on a zod object schema.
 * @category CLI
 */
export function schemaFieldNames(schema: z.ZodType | undefined): string[] {
  if (!schema || !(schema instanceof z.ZodObject)) return []
  return Object.keys(schema.shape as Record<string, unknown>)
}
