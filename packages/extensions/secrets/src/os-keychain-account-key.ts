import { ECP_KEYRING_ACCOUNT_PREFIX } from "./constants.js"
import { canonicalSecretKey, secretRefIdFromLogicalKey } from "./ref.js"

/**
 * Canonical logical key for OS storage.
 * @category Secrets
 */
export function canonicalSecretKeyForOsStorage(key: string): string {
  return canonicalSecretKey(key)
}

/**
 * OS keyring target for `Entry.withTarget`.
 * @category Secrets
 */
export function osKeychainCredentialTarget(logicalKey: string): string {
  return secretRefIdFromLogicalKey(logicalKey)
}

/**
 * Map a key to a dotted `ecp.*` name (legacy display helpers only).
 * @category Secrets
 */
export function normalizeOsKeychainAccountKey(key: string): string {
  let k = key.trim().replace(/\\/g, "/")
  if (k.startsWith("ecp/")) {
    k = k.slice(4)
  }
  k = k.replace(/\//g, ".")
  if (!k.startsWith(ECP_KEYRING_ACCOUNT_PREFIX)) {
    k = `${ECP_KEYRING_ACCOUNT_PREFIX}${k}`
  }
  return k
}
