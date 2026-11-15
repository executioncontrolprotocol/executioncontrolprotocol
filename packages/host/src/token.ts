import { randomBytes } from "node:crypto"

/**
 * Generate a 43-character base64url host token (32 random bytes).
 * @category Host
 */
export function generateHostToken(): string {
  return randomBytes(32).toString("base64url")
}
