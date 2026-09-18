/** Storage durability tier. @category Storage */
export type StorageTier = "temp" | "durable"

/** Directory name under `~/.ecp` for each tier. @category Storage */
export const STORAGE_TIER_DIR: Record<StorageTier, string> = {
  temp: "temp",
  durable: "artifacts",
}

/** Reserved workflows directory name (layout only). @category Storage */
export const ECP_WORKFLOWS_DIR = "workflows"

/** URI prefix for storage-backed artifacts. @category Storage */
export const STORAGE_URI_PREFIX = "ecp://storage/"

/**
 * Build `ecp://storage/<tier>/<key>` URI.
 * @category Storage
 */
export function storageUri(tier: StorageTier, key: string): string {
  const normalized = key.replace(/^\/+/, "").replace(/\\/g, "/")
  return `${STORAGE_URI_PREFIX}${STORAGE_TIER_DIR[tier]}/${normalized}`
}

/**
 * Parse tier + key from a storage URI or a key that already includes the tier dir.
 * @category Storage
 */
export function parseStorageKey(
  keyOrUri: string,
  fallbackTier?: StorageTier
): { tier: StorageTier; key: string } {
  let rest = keyOrUri.trim()
  if (rest.startsWith(STORAGE_URI_PREFIX)) {
    rest = rest.slice(STORAGE_URI_PREFIX.length)
  }
  rest = rest.replace(/\\/g, "/").replace(/^\/+/, "")
  if (rest.startsWith("temp/")) {
    return { tier: "temp", key: rest.slice("temp/".length) }
  }
  if (rest.startsWith("artifacts/")) {
    return { tier: "durable", key: rest.slice("artifacts/".length) }
  }
  if (fallbackTier) {
    return { tier: fallbackTier, key: rest }
  }
  return { tier: "temp", key: rest }
}
