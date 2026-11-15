/**
 * Agent-facing metadata used to build MCP tool descriptions.
 * @category MCP
 */
export interface ToolMetadataLike {
  /** One-line summary. */
  summary?: string
  /** Longer description. */
  description?: string
  /** When to use the tool. */
  useCases?: string[]
  /** Output projections. */
  projections?: Array<{ summary: string; description: string }>
}

/**
 * Build an MCP tool description from capability or operation metadata.
 * @category MCP
 */
export function toolDescription(metadata: ToolMetadataLike | undefined): string {
  if (!metadata) return ""
  const parts: string[] = []
  if (metadata.summary) parts.push(metadata.summary)
  if (metadata.description && metadata.description !== metadata.summary) {
    parts.push(metadata.description)
  }
  if (metadata.useCases && metadata.useCases.length > 0) {
    parts.push("Use cases:")
    for (const useCase of metadata.useCases) parts.push(`- ${useCase}`)
  }
  if (metadata.projections && metadata.projections.length > 0) {
    parts.push("Projections:")
    for (const projection of metadata.projections) {
      parts.push(`- ${projection.summary}: ${projection.description}`)
    }
  }
  return parts.join("\n")
}
