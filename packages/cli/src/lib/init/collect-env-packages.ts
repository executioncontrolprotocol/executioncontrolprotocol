/**
 * Map an import specifier to its npm package name.
 * Subpaths resolve to the owning package (`@scope/name/sub` → `@scope/name`).
 * @category CLI
 */
export function npmPackageFromSpecifier(specifier: string): string | undefined {
  const trimmed = specifier.trim()
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:")) {
    return undefined
  }
  if (trimmed.startsWith("@")) {
    const parts = trimmed.split("/")
    if (parts.length < 2 || !parts[0] || !parts[1]) return undefined
    return `${parts[0]}/${parts[1]}`
  }
  return trimmed.split("/")[0]
}

const IMPORT_FROM_RE = /(?:from|import)\s+["']([^"']+)["']/g

/**
 * Collect npm package names from environment module source (side-effect and named imports).
 * @category CLI
 */
export function collectPackagesFromEnvironmentSource(source: string): string[] {
  const names = new Set<string>()
  for (const match of source.matchAll(IMPORT_FROM_RE)) {
    const pkg = npmPackageFromSpecifier(match[1] ?? "")
    if (pkg) names.add(pkg)
  }
  names.add("@executioncontrolprotocol/node")
  return [...names].sort()
}

/** Dev-only packages added by `ecp init`. @category CLI */
export const INIT_DEV_DEPENDENCIES = ["@executioncontrolprotocol/cli"] as const
