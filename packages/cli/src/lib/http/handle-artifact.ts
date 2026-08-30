import type { IncomingMessage, ServerResponse } from "node:http"
import { resolveArtifactFilename, parseArtifactFetchPathname, type Ecp } from "@executioncontrolprotocol/core"
import { writeJson } from "./write-json.js"

/**
 * Sanitize a filename for Content-Disposition (strip quotes / path separators).
 * @category CLI
 */
export function sanitizeArtifactFilename(
  name: string | undefined,
  uri: string,
  mediaType?: string
): string {
  return resolveArtifactFilename(name, uri, mediaType)
}

/**
 * Handle `GET /v1/artifacts` or `GET /v1/artifacts/<filename>?uri=…` — serve host artifact bytes.
 * Caller is responsible for authentication.
 * @category CLI
 */
export async function handleArtifactGet(
  ecp: Ecp,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const host = req.headers.host ?? "127.0.0.1"
  const url = new URL(req.url ?? "/", `http://${host}`)
  const uri = url.searchParams.get("uri")?.trim() ?? ""
  if (!uri || !uri.startsWith("ecp://")) {
    writeJson(res, 400, { error: "uri query parameter is required (ecp://…)" })
    return
  }

  const store = typeof ecp.getArtifactStore === "function" ? ecp.getArtifactStore() : undefined
  const artifact = store?.get(uri)
  if (!artifact) {
    writeJson(res, 404, { error: `Artifact not found: ${uri}` })
    return
  }

  const pathHint = parseArtifactFetchPathname(url.pathname)
  const filename = sanitizeArtifactFilename(
    artifact.name ?? pathHint,
    uri,
    artifact.mediaType
  )
  const body = Buffer.from(artifact.bytes)
  res.writeHead(200, {
    "Content-Type": artifact.mediaType || "application/octet-stream",
    "Content-Length": body.length,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "no-store",
  })
  res.end(body)
}
