/**
 * Suggestion matching for validation issues.
 * @category Validation
 */

/**
 * Damerau–Levenshtein distance.
 * @category Validation
 */
export function damerauLevenshtein(left: string, right: string): number {
  const rows = left.length + 1
  const cols = right.length + 1
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let row = 0; row < rows; row += 1) matrix[row]![0] = row
  for (let col = 0; col < cols; col += 1) matrix[0]![col] = col
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1
      const insert = matrix[row]![col - 1]! + 1
      const remove = matrix[row - 1]![col]! + 1
      const replace = matrix[row - 1]![col - 1]! + cost
      let best = Math.min(insert, remove, replace)
      if (row > 1 && col > 1 && left[row - 1] === right[col - 2] && left[row - 2] === right[col - 1]) {
        best = Math.min(best, matrix[row - 2]![col - 2]! + 1)
      }
      matrix[row]![col] = best
    }
  }
  return matrix[left.length]![right.length]!
}

/**
 * Candidates within distance 2, or a prefix of either string. The needle itself is omitted.
 * @category Validation
 */
export function closeMatches(needle: string, candidates: readonly string[]): string[] {
  const matches: string[] = []
  for (const candidate of candidates) {
    if (candidate === needle) continue
    const prefix = candidate.startsWith(needle) || needle.startsWith(candidate)
    if (prefix || damerauLevenshtein(needle, candidate) <= 2) matches.push(candidate)
  }
  return matches
}
