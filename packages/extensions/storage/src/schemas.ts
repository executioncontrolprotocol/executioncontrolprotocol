import { z } from "zod"

/** Storage durability tiers. @category Storage */
export const storageTier = z.enum(["temp", "durable"])

/**
 * Legacy dual fluent+manifest bundle schema (load only).
 * @category Storage
 */
export const WORKFLOW_BUNDLE_SCHEMA = "@executioncontrolprotocol.workflow.bundle"

/**
 * Filename suffix for Fluent host library files.
 * @category Storage
 */
export const WORKFLOW_FLUENT_SUFFIX = ".workflow.ts"

/** Legacy portable workflow bundle (accepted on load / migration). @category Storage */
export const workflowBundleSchema = z.object({
  schema: z.literal(WORKFLOW_BUNDLE_SCHEMA),
  version: z.literal("1.0"),
  id: z.string().min(1),
  label: z.string().min(1),
  updatedAt: z.string().min(1),
  fluent: z.string(),
  manifest: z.record(z.string(), z.unknown()),
})

/** @category Storage */
export type WorkflowBundle = z.infer<typeof workflowBundleSchema>

/** Write input for `@executioncontrolprotocol/storage.write`. @category Storage */
export const storageWriteInputSchema = z.object({
  /** Logical key under the tier root (relative path). */
  key: z.string().min(1),
  /** Value to store (bytes as Uint8Array/base64, or JSON-serializable). */
  value: z.unknown(),
  /** Durability tier (default temp). */
  tier: storageTier.default("temp"),
  /**
   * How to interpret `value` when it is a string.
   * `base64` / `raw` → binary; `utf8` → text; omit → JSON for objects, raw for Uint8Array.
   */
  encoding: z.enum(["raw", "json", "utf8", "base64"]).optional(),
  /** Optional MIME type for media sidecars. */
  mediaType: z.string().optional(),
  /** Optional display name. */
  name: z.string().optional(),
})

/** Write output. @category Storage */
export const storageWriteOutputSchema = z.object({
  ok: z.boolean(),
  /** Full artifact URI (`ecp://storage/<tier>/<key>`). */
  uri: z.string(),
  /** Resolved tier. */
  tier: storageTier,
})

/** Read input. @category Storage */
export const storageReadInputSchema = z.object({
  /** Logical key, or full path including tier prefix (`temp/…` / `artifacts/…`). */
  key: z.string().min(1),
  /** Durability tier when `key` does not start with `temp/` or `artifacts/`. */
  tier: storageTier.optional(),
})

/** Read output. @category Storage */
export const storageReadOutputSchema = z.object({
  value: z.unknown().optional(),
  mediaType: z.string().optional(),
  name: z.string().optional(),
  tier: storageTier.optional(),
  uri: z.string().optional(),
})

/** Save Fluent workflow input. @category Storage */
export const workflowSaveInputSchema = z.object({
  /** Stable id (filename stem). */
  id: z.string().min(1),
  /** Display label (stored in sidecar). */
  label: z.string().min(1).optional(),
  /** Fluent TypeScript source. */
  fluent: z.string(),
})

/** Save Fluent workflow output. @category Storage */
export const workflowSaveOutputSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  path: z.string(),
})

/** List workflows output entry. @category Storage */
export const workflowListEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  updatedAt: z.string(),
})

/** List workflows input (empty). @category Storage */
export const workflowListInputSchema = z.object({}).default({})

/** List workflows output. @category Storage */
export const workflowListOutputSchema = z.object({
  workflows: z.array(workflowListEntrySchema),
})

/** Load workflow input. @category Storage */
export const workflowLoadInputSchema = z.object({
  id: z.string().min(1),
})

/** Load workflow output (Fluent source + list metadata). @category Storage */
export const workflowLoadOutputSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  updatedAt: z.string().optional(),
  fluent: z.string().optional(),
})

/** Delete workflow input. @category Storage */
export const workflowDeleteInputSchema = z.object({
  id: z.string().min(1),
})

/** Delete workflow output. @category Storage */
export const workflowDeleteOutputSchema = z.object({
  ok: z.boolean(),
  deleted: z.boolean(),
})
