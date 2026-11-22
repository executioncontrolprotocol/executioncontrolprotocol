import { fileRefSchema } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

/**
 * Media types `parse-csv` reads.
 * @category Plugins
 */
export const CSV_MEDIA_TYPES = ["text/csv", "application/csv", "text/plain"] as const

/**
 * Input of `parse-csv`.
 * @category Plugins
 */
export const parseCsvAcceptsSchema = z.object({
  /** The CSV file. Any FileRef kind: the host reads the bytes. */
  file: fileRefSchema({ access: "bytes", mediaTypes: [...CSV_MEDIA_TYPES] }),
  /** Field separator: one character, not a quote or a line break. Default `,`. */
  delimiter: z.string().optional(),
  /** Treat the first record as column names. Default `true`. */
  header: z.boolean().optional(),
})

/**
 * Output of `parse-csv`.
 * @category Plugins
 */
export const parseCsvReturnsSchema = z.object({
  /** Column names from the header; `[]` when `header` is false. */
  columns: z.array(z.string()),
  /** One object per record keyed by column, or arrays of strings when `header` is false. */
  rows: z.array(z.union([z.record(z.string(), z.string()), z.array(z.string())])),
})

/**
 * Typed input of `parse-csv`.
 * @category Plugins
 */
export type ParseCsvInput = z.infer<typeof parseCsvAcceptsSchema>
