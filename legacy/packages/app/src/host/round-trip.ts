/**
 * Why a workflow file cannot round-trip through `renderWorkflowToFluent`.
 * @category App
 */
export interface RoundTripResult {
  /** True when graph edits may rewrite the file. */
  ok: boolean
  /** Human-readable reasons when `ok` is false. */
  reasons: string[]
}

const CORE_IMPORT = "@executioncontrolprotocol/core"
const RELATIVE_IMPORT = /from\s+["'](\.\.?\/[^"']+)["']/g
const SIDE_IMPORT = /(?:^|\n)\s*import\s+["']([^"']+)["']/g
const NAMED_IMPORT = /from\s+["']([^"']+)["']/g
const COMPUTED_WITH =
  /\.with\(\s*(?:[A-Za-z_$][\w$]*|\([^)]*\)\s*=>|function\b|[`][^`]*\$\{)/

/**
 * Detect constructs the Fluent encoder cannot express (relative imports,
 * non-core imports, computed `.with()` values). Comments and formatting are
 * lost on save but do not force read-only.
 * Encoder-written files (core-only imports, object-literal `.with()`) return ok.
 * @category App
 */
export function canRoundTrip(source: string): RoundTripResult {
  const reasons: string[] = []
  const relative = [...source.matchAll(RELATIVE_IMPORT)].map((match) => match[1])
  if (relative.length > 0) {
    reasons.push(
      `Relative imports cannot round-trip (${relative.slice(0, 3).join(", ")})`
    )
  }

  const specifiers = new Set<string>()
  for (const match of source.matchAll(NAMED_IMPORT)) {
    if (match[1]) specifiers.add(match[1])
  }
  for (const match of source.matchAll(SIDE_IMPORT)) {
    if (match[1]) specifiers.add(match[1])
  }
  const foreign = [...specifiers].filter(
    (spec) => spec !== CORE_IMPORT && !spec.startsWith(".")
  )
  if (foreign.length > 0) {
    reasons.push(
      `Only ${CORE_IMPORT} imports can round-trip (found ${foreign.slice(0, 3).join(", ")})`
    )
  }

  if (COMPUTED_WITH.test(source)) {
    reasons.push("Computed .with() values cannot round-trip")
  }

  return { ok: reasons.length === 0, reasons }
}
