import type { CapabilityMetadata, ExtensionMetadata } from "@executioncontrolprotocol/core/types"
import type { OperationMetadata } from "./define-operation.js"

/**
 * Build an oclif description from metadata (description + use cases + projections).
 * @category CLI
 */
export function descriptionFromMetadata(
  metadata: CapabilityMetadata | ExtensionMetadata | OperationMetadata | undefined
): string {
  if (!metadata) return ""
  const parts: string[] = []
  if (metadata.description) parts.push(metadata.description)
  if ("useCases" in metadata && metadata.useCases && metadata.useCases.length > 0) {
    parts.push("Use cases:")
    for (const useCase of metadata.useCases) parts.push(`- ${useCase}`)
  }
  if (
    "projections" in metadata &&
    metadata.projections &&
    Array.isArray(metadata.projections) &&
    metadata.projections.length > 0
  ) {
    parts.push("Projections:")
    for (const projection of metadata.projections) {
      parts.push(`- ${projection.summary}: ${projection.description}`)
    }
  }
  return parts.join("\n")
}

/**
 * Generate example strings from top-level primitive schema field names.
 * @category CLI
 */
export function examplesFromFields(
  bin: string,
  commandId: string,
  fields: string[]
): string[] {
  if (fields.length === 0) {
    return [`${bin} ${commandId.replaceAll(":", " ")} --input payload.json`]
  }
  const flagBits = fields.slice(0, 3).map((field) => `--${field} <${field}>`)
  return [`${bin} ${commandId.replaceAll(":", " ")} ${flagBits.join(" ")}`]
}
