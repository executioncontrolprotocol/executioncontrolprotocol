import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type { EnvironmentDescriptor, SearchOptions, SearchResult, SearchResultItem } from "@executioncontrolprotocol/types"

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

function scoreText(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const hay = text.toLowerCase()
  let matched = 0
  for (const t of tokens) {
    if (hay.includes(t)) matched++
  }
  return matched / tokens.length
}

/** Fuzzy search over environment descriptor sections. */
export function searchCapabilities(
  query: string,
  descriptor: EnvironmentDescriptor,
  options?: SearchOptions
): SearchResult {
  const tokens = tokenize(query)
  const types = options?.types ?? ["capability"]
  const results: SearchResultItem[] = []

  if (types.includes("capability")) {
    for (const cap of descriptor.capabilities) {
      const text = `${cap.id} ${cap.label ?? ""} ${cap.extension ?? ""}`
      const score = scoreText(text, tokens)
      if (score > 0) {
        const base = {
          type: "capability" as const,
          id: cap.id,
          label: cap.label,
          score,
          reason: `Matched ${Math.round(score * 100)}% of query tokens`,
        }
        const item: SearchResultItem = { ...base }
        if (options?.include?.includes("inputSchema")) item.inputSchema = cap.inputSchema
        if (options?.include?.includes("outputSchema")) item.outputSchema = cap.outputSchema
        results.push(item)
      }
    }
  }

  if (types.includes("extension")) {
    for (const ext of descriptor.extensions) {
      const text = `${ext.id} ${ext.label ?? ""}`
      const score = scoreText(text, tokens)
      if (score > 0) {
        results.push({
          type: "extension",
          id: ext.id,
          label: ext.label,
          score,
          reason: `Extension matched query`,
        })
      }
    }
  }

  if (types.includes("policy")) {
    for (const pol of descriptor.policies) {
      const text = `${pol.id} ${pol.label ?? ""} ${pol.summary ?? ""}`
      const score = scoreText(text, tokens)
      if (score > 0) {
        results.push({
          type: "policy",
          id: pol.id,
          label: pol.label,
          score,
          reason: `Policy matched query`,
        })
      }
    }
  }

  results.sort((a, b) => b.score - a.score)
  const limit = options?.limit ?? 5

  return {
    schema: "@executioncontrolprotocol.environment.search",
    version: LATEST_ECP_VERSION,
    results: results.slice(0, limit),
  }
}
