import { ECP_CORE_FORMATTER_IDS, type NamespacedId } from "@executioncontrolprotocol/types"
import { getCatalogedExtension, normalizeExtensionId } from "../registry/extension-catalog.js"

/** Core formatter ids that do not require environment binding. @category Harness */
export const CORE_FORMATTER_IDS = new Set<string>([
  ECP_CORE_FORMATTER_IDS.JSON,
  ECP_CORE_FORMATTER_IDS.FLUENT,
])

/**
 * Whether a formatter id is core-cataloged (always available).
 * @category Harness
 */
export function isCoreFormatterId(formatId: string): boolean {
  return CORE_FORMATTER_IDS.has(normalizeExtensionId(formatId))
}

/**
 * Normalize harness config format field to extension id.
 * @category Harness
 */
export function normalizeFormatId(format: string): NamespacedId {
  return normalizeExtensionId(format)
}

/**
 * Whether formatter is registered in catalog or core set.
 * @category Harness
 */
export function isFormatterRegistered(formatId: string): boolean {
  const normalized = normalizeFormatId(formatId)
  if (isCoreFormatterId(normalized)) return true
  return getCatalogedExtension(normalized) !== undefined
}

/**
 * Infer model response format hint from formatter id.
 * @category Harness
 */
/** Logical harness output format for TypeScript source (not an extension id). @category Harness */
export const HARNESS_OUTPUT_FORMAT_TYPESCRIPT = "typescript" as const

export function inferResponseFormatFromFormatter(
  formatId: string
): "text" | "json" | "toon" | "eql" | undefined {
  if (formatId === HARNESS_OUTPUT_FORMAT_TYPESCRIPT) return "text"
  const id = normalizeFormatId(formatId)
  if (id === ECP_CORE_FORMATTER_IDS.JSON) return "json"
  if (id === "@executioncontrolprotocol/format-toon") return "toon"
  if (id === "@executioncontrolprotocol/format-eql") return "eql"
  return "text"
}
