import { z } from "zod"

/** Storage durability tiers. @category Storage */
export const storageTier = z.enum(["temp", "durable"])

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
