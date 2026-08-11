import type { IncomingMessage, ServerResponse } from "node:http"

/**
 * Apply CORS + Private Network Access headers for Chromium loopback access.
 * @category CLI
 */
export function setCorsAndPna(
  req: IncomingMessage,
  res: ServerResponse,
  allowOrigins: ReadonlySet<string>
): void {
  const origin = req.headers.origin
  if (typeof origin === "string" && allowOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true")
  }
}

/**
 * Extract Bearer token from Authorization header.
 * @category CLI
 */
export function readBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== "string") return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || undefined
}
