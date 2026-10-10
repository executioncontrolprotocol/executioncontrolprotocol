import { z } from "zod"

/**
 * Plain-text note for what to take from a capability output after the call.
 * Used after discovery / inspect runs; not a sample payload or path query.
 * @category Schema
 */
export interface CapabilityProjection {
  /** What to take from the output after the call. */
  summary: string
  /** How to take it, in sentences. */
  description: string
}

/**
 * Agent-facing capability docs authored via {@code .withMetadata()}.
 * @category Schema
 */
export interface CapabilityMetadata {
  /** One-line what + when (inventory / catalog). */
  summary: string
  /** Full agent docs: behavior, product limits, when this capability applies. */
  description: string
  /** Concrete situations an agent should recognize (before the call). */
  useCases: string[]
  /** Optional distinct display title; describe falls back to capability name. */
  label?: string
  /**
   * What to take from the output after the call, in plain text.
   * Stays off authoring inventory; shown with exact-id detail and after inspect runs.
   */
  projections?: CapabilityProjection[]
  /** Non-standard extensions (vendor docs urls, tags, …). */
  _meta?: Record<string, unknown>
}

/**
 * Agent-facing extension docs authored via {@code .withMetadata()}.
 * @category Schema
 */
export interface ExtensionMetadata {
  /** One-line what + when. */
  summary: string
  /** Full agent docs for the extension package. */
  description: string
  /** Optional situations an agent should recognize. */
  useCases?: string[]
  /** Optional distinct display title. */
  label?: string
  /**
   * When `false`, harness authoring inventory omits this extension.
   * Default / omit is `true` (workflow-facing packages stay visible).
   */
  isAuthorable?: boolean
  /** Non-standard extensions. */
  _meta?: Record<string, unknown>
}

/** Banned protocol/schema how-to phrases in author prose. @category Schema */
export const METADATA_PROSE_BANNED_PHRASES = [
  "inputschema",
  "outputschema",
  "withinput",
  "withoutput",
  "exact-id describe",
  "exact id describe",
  "json schema",
  "do not invent fields",
] as const

/**
 * Find a banned schema-howto phrase in author prose (case-insensitive).
 * @category Schema
 */
export function findBannedMetadataProsePhrase(text: string): string | undefined {
  const hay = text.toLowerCase()
  for (const phrase of METADATA_PROSE_BANNED_PHRASES) {
    if (hay.includes(phrase)) return phrase
  }
  return undefined
}

function assertProseClean(field: string, value: string): void {
  const banned = findBannedMetadataProsePhrase(value)
  if (banned) {
    throw new Error(
      `Capability/extension metadata.${field} must not contain schema how-to phrase "${banned}"`
    )
  }
}

function assertProseListClean(field: string, values: string[]): void {
  for (const value of values) {
    assertProseClean(field, value)
  }
}

/** Zod schema for {@link CapabilityProjection}. @category Schema */
export const capabilityProjectionSchema = z
  .object({
    summary: z.string().min(1),
    description: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    try {
      assertProseClean("projections.summary", value.summary)
      assertProseClean("projections.description", value.description)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

/** Zod schema for {@link CapabilityMetadata}. @category Schema */
export const capabilityMetadataSchema = z
  .object({
    summary: z.string().min(1),
    description: z.string().min(1),
    useCases: z.array(z.string().min(1)).min(1),
    label: z.string().min(1).optional(),
    projections: z.array(capabilityProjectionSchema).optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    try {
      assertProseClean("summary", value.summary)
      assertProseClean("description", value.description)
      assertProseListClean("useCases", value.useCases)
      if (value.label) assertProseClean("label", value.label)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

/** Zod schema for {@link ExtensionMetadata}. @category Schema */
export const extensionMetadataSchema = z
  .object({
    summary: z.string().min(1),
    description: z.string().min(1),
    useCases: z.array(z.string().min(1)).optional(),
    label: z.string().min(1).optional(),
    isAuthorable: z.boolean().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    try {
      assertProseClean("summary", value.summary)
      assertProseClean("description", value.description)
      if (value.useCases) assertProseListClean("useCases", value.useCases)
      if (value.label) assertProseClean("label", value.label)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

/**
 * Parse and validate capability metadata (throws on invalid / banned prose).
 * Legacy {@code samplePrompts} / {@code examples} keys are stripped.
 * @category Schema
 */
export function parseCapabilityMetadata(input: unknown): CapabilityMetadata {
  return capabilityMetadataSchema.parse(input)
}

/**
 * Parse and validate extension metadata (throws on invalid / banned prose).
 * Legacy {@code samplePrompts} keys are stripped.
 * @category Schema
 */
export function parseExtensionMetadata(input: unknown): ExtensionMetadata {
  return extensionMetadataSchema.parse(input)
}
