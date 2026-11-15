/**
 * Virtual Monaco URI for the read-only Config tab.
 * @category App
 */
export const CONFIG_EDITOR_PATH = "file:///ecp-workflow/config.ecp.ts"

const DEFAULT_CONFIG_FILENAME = "config.ecp.ts"

/**
 * Filename from a host path. Browser-safe (no `node:path`).
 * @category App
 */
export function configFilename(path: string | undefined): string {
  if (!path) return DEFAULT_CONFIG_FILENAME
  const normalized = path.replaceAll("\\", "/")
  const slash = normalized.lastIndexOf("/")
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized
  return name || DEFAULT_CONFIG_FILENAME
}
