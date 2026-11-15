/**
 * One searchable record. `id` is required; the other fields are the text that can match.
 * @category Operations
 */
export interface MatchCandidate {
  /** Stable id. Ties break by this, ascending. */
  id: string
  /** Short label or summary. */
  summary?: string
  /** Longer description, including use cases joined by the caller. */
  description?: string
}

/**
 * A scored match. Score 0 is never returned.
 * @category Operations
 */
export interface MatchHit {
  /** Candidate id. */
  id: string
  /** Match score. Higher is better. */
  score: number
}

/**
 * Tokenise a query: lowercase, split on non-alphanumerics, drop 1-character tokens.
 * @category Operations
 */
export function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

/**
 * Score candidates. +5 per token in the id, +3 in the summary, +1 in the description,
 * +3 when every token matches. Results are sorted by score, then id, and capped by `limit`.
 * @category Operations
 */
export function matchCandidates(query: string, candidates: readonly MatchCandidate[], limit = 10): MatchHit[] {
  const tokens = tokensOf(query)
  if (tokens.length === 0) return []
  const hits: MatchHit[] = []
  for (const candidate of candidates) {
    const id = candidate.id.toLowerCase()
    const summary = (candidate.summary ?? "").toLowerCase()
    const description = (candidate.description ?? "").toLowerCase()
    let score = 0
    let matched = 0
    for (const token of tokens) {
      const inId = id.includes(token)
      const inSummary = summary.includes(token)
      const inDescription = description.includes(token)
      if (inId) score += 5
      if (inSummary) score += 3
      if (inDescription) score += 1
      if (inId || inSummary || inDescription) matched += 1
    }
    if (matched === tokens.length) score += 3
    if (score > 0) hits.push({ id: candidate.id, score })
  }
  hits.sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return hits.slice(0, limit)
}
