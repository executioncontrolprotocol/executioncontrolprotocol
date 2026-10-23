import { ECP_SECRET_REF_PROTOCOL_PREFIX } from "./constants.js"

/**
 * Normalize a logical secret key (trim, backslashes to `/`).
 * @category Secrets
 */
export function canonicalSecretKey(key: string): string {
  return key.trim().replace(/\\/g, "/")
}

/**
 * Default secret ref id: `ecp://` plus normalized key.
 * @category Secrets
 */
export function secretRefIdFromLogicalKey(key: string): string {
  return `${ECP_SECRET_REF_PROTOCOL_PREFIX}${canonicalSecretKey(key)}`
}
