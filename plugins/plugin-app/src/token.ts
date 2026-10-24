import { randomBytes, timingSafeEqual } from "node:crypto"
import { APP_BEARER_PREFIX, APP_TOKEN_QUERY } from "@executioncontrolprotocol/app"
import { APP_TOKEN_COOKIE } from "./constants.js"

/**
 * Generate a random pairing token. Never log this in tests.
 * @category App
 */
export function generateAppToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * True when two tokens are equal. Length mismatch is not equal.
 * @category App
 */
export function tokensEqual(given: string, expected: string): boolean {
  const left = Buffer.from(given)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith(APP_BEARER_PREFIX)) return undefined
  return header.slice(APP_BEARER_PREFIX.length)
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1)
  }
  return undefined
}

/**
 * Pairing token from the query string, `Authorization: Bearer`, or cookie.
 * @category App
 */
export function tokenFromRequest(
  url: URL,
  headers: { authorization?: string; cookie?: string }
): string | undefined {
  const query = url.searchParams.get(APP_TOKEN_QUERY)
  if (query) return query
  const bearer = bearerToken(headers.authorization)
  if (bearer) return bearer
  return cookieValue(headers.cookie, APP_TOKEN_COOKIE)
}
