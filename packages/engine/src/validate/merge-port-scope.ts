/**
 * Scope segments for L3 merge-port validation (mirrors document order in the App).
 * @category Validation
 */
export interface ScopeSegment {
  /** Control structure kind at this nesting level. */
  kind: "if" | "parallel" | "loop"
  /** Structure node id. */
  id: string
  /** `if` branch side. */
  side?: "then" | "else"
  /** `parallel` path index. */
  index?: number
}

/**
 * Result of analysing a merge-port `$ref` list.
 * @category Validation
 */
export interface MergePortAnalysis {
  /** Both refs are allowed on one merge port (opposite `if` sides or nested equivalent). */
  valid: boolean
  /** Every side of the separating `if` is covered by at least one ref. */
  definite: boolean
}

function innerSeparatingIf(
  a: ScopeSegment[],
  b: ScopeSegment[],
): { id: string; depth: number } | undefined {
  const maxLen = Math.max(a.length, b.length)
  for (let depth = 0; depth < maxLen; depth += 1) {
    const sa = a[depth]
    const sb = b[depth]
    if (!sa || !sb) continue
    if (sa.kind !== sb.kind || sa.id !== sb.id) continue
    if (sa.kind === "parallel" && sa.index !== undefined && sb.index !== undefined) {
      return undefined
    }
    if (sa.kind === "if" && sa.side && sb.side && sa.side !== sb.side) {
      return { id: sa.id, depth }
    }
  }
  return undefined
}

function pairAllowed(a: ScopeSegment[], b: ScopeSegment[]): boolean {
  return innerSeparatingIf(a, b) !== undefined
}

function outermostSeparator(scopes: ScopeSegment[][]): string | undefined {
  let best: { id: string; depth: number } | undefined
  for (let i = 0; i < scopes.length; i += 1) {
    for (let j = i + 1; j < scopes.length; j += 1) {
      const sep = innerSeparatingIf(scopes[i]!, scopes[j]!)
      if (!sep) continue
      if (!best || sep.depth < best.depth) best = { id: sep.id, depth: sep.depth }
    }
  }
  return best?.id
}

function deepestIfSide(scope: ScopeSegment[], ifId: string): "then" | "else" | undefined {
  let found: "then" | "else" | undefined
  for (const segment of scope) {
    if (segment.kind === "if" && segment.id === ifId && segment.side) found = segment.side
  }
  return found
}

function refUnderBranch(scope: ScopeSegment[], ifId: string, side: "then" | "else"): boolean {
  const index = scope.findIndex((segment) => segment.kind === "if" && segment.id === ifId)
  if (index < 0) return false
  return scope[index]!.side === side
}

function branchCovered(scopes: ScopeSegment[][], ifId: string, side: "then" | "else"): boolean {
  const onSide = scopes.filter((scope) => refUnderBranch(scope, ifId, side))
  if (onSide.length === 0) return false
  for (const scope of onSide) {
    if (deepestIfSide(scope, ifId) !== side) continue
    const depth = scope.findIndex((segment) => segment.kind === "if" && segment.id === ifId)
    const nested = scope.slice(depth + 1).some((segment) => segment.kind === "if")
    if (!nested) return true
  }
  const inner = outermostSeparator(onSide)
  if (!inner || inner === ifId) return false
  return branchCovered(onSide, inner, "then") && branchCovered(onSide, inner, "else")
}

/**
 * Validates that merge-port refs sit on opposite sides of the same `if` (or nested coverage).
 * @category Validation
 */
export function analyseMergePort(scopes: ScopeSegment[][]): MergePortAnalysis {
  if (scopes.length < 2) return { valid: false, definite: false }
  for (let i = 0; i < scopes.length; i += 1) {
    for (let j = i + 1; j < scopes.length; j += 1) {
      if (!pairAllowed(scopes[i]!, scopes[j]!)) return { valid: false, definite: false }
    }
  }
  const separator = outermostSeparator(scopes)
  if (!separator) return { valid: false, definite: false }
  const definite = branchCovered(scopes, separator, "then") && branchCovered(scopes, separator, "else")
  return { valid: true, definite }
}