import type { IncomingMessage, ServerResponse } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { writeJson } from "./write-json.js"

/**
 * Sanitize a filename for Content-Disposition (strip quotes / path separators).
 * @category CLI
 */
export function sanitizeArtifactFilename(name: string | undefined, uri: string): string {
  const raw = (name?.trim() || uri.split("/").pop() || "artifact").replace(/["\\\r\n]/g, "")
  return raw.replace(/[/\\]/g, "_") || "artifact"
}

/**
 * Handle `GET /v1/artifacts?uri=…` — serve host artifact bytes with Content-Type.
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

  const filename = sanitizeArtifactFilename(artifact.name, uri)
  const body = Buffer.from(artifact.bytes)
  res.writeHead(200, {
    "Content-Type": artifact.mediaType || "application/octet-stream",
    "Content-Length": body.length,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "no-store",
  })
  res.end(body)
}
