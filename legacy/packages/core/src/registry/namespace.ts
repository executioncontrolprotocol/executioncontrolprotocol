/**
 * Match a namespaced id against an allow/deny pattern (`@customer/*` or exact).
 * @category Runtime
 */
export function matchesNamespace(id: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2)
    return id === prefix || id.startsWith(`${prefix}/`)
  }
  return id === pattern
}

/**
 * Returns true if id matches any pattern in the list.
 * @category Runtime
 */
export function matchesAnyNamespace(id: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesNamespace(id, p))
}
