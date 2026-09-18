import type { IncomingMessage, ServerResponse } from "node:http"
import {
  resolveArtifactFilename,
  parseArtifactFetchPathname,
  STORAGE_ARTIFACT_URI_PREFIX,
  type Ecp,
} from "@executioncontrolprotocol/core"
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

function bytesFromStorageValue(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value)
  if (typeof value === "string") {
    return new Uint8Array(Buffer.from(value, "base64"))
  }
  return undefined
}

/**
 * Handle `GET /v1/artifacts` or `GET /v1/artifacts/<filename>?uri=…` — serve host artifact bytes.
 * Resolves in-memory `ctx.artifacts` first, then `ecp://storage/…` via storage.read.
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
  let mediaType = "application/octet-stream"
  let name: string | undefined
  let body: Buffer | undefined

  const fromMemory = store?.get(uri)
  if (fromMemory) {
    mediaType = fromMemory.mediaType || mediaType
    name = fromMemory.name
    body = Buffer.from(fromMemory.bytes)
  } else if (uri.startsWith(STORAGE_ARTIFACT_URI_PREFIX) && typeof ecp.invoke === "function") {
    try {
      const key = uri.slice(STORAGE_ARTIFACT_URI_PREFIX.length)
      const result = await ecp
        .invoke("@executioncontrolprotocol/storage.read")
        .with({ key })
        .process<{
          value?: unknown
          mediaType?: string
          name?: string
        }>()
      if (result.success && result.result) {
        const bytes = bytesFromStorageValue(result.result.value)
        if (bytes) {
          mediaType = result.result.mediaType || mediaType
          name = result.result.name
          body = Buffer.from(bytes)
        }
      }
    } catch {
      body = undefined
    }
  }

  if (!body) {
    writeJson(res, 404, { error: `Artifact not found: ${uri}` })
    return
  }

  const pathHint = parseArtifactFetchPathname(url.pathname)
  const filename = sanitizeArtifactFilename(name ?? pathHint, uri, mediaType)
  res.writeHead(200, {
    "Content-Type": mediaType,
    "Content-Length": body.length,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "no-store",
  })
  res.end(body)
}
