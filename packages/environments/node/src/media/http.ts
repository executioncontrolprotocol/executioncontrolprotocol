import {
  MEDIA_HTTP_PATH,
  base64ToBytes,
  bytesToBase64,
  type MediaHttpReadResponse,
  type MediaHttpWriteRequest,
  type MediaStore,
} from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS, type FileRef } from "@executioncontrolprotocol/core/types"

/** Result of {@link handleMediaHttp}. @category Media */
export interface MediaHttpResult {
  /** HTTP status. */
  status: number
  /** JSON body. */
  json: unknown
}

function isWriteRequest(body: unknown): body is MediaHttpWriteRequest {
  if (body === null || typeof body !== "object") return false
  const row = body as MediaHttpWriteRequest
  return typeof row.bytes === "string" && typeof row.mediaType === "string"
}

/**
 * Handle `POST`/`GET` {@link MEDIA_HTTP_PATH} against a bound {@link MediaStore}.
 * Returns `undefined` when the path is not the media route.
 * @category Media
 */
export async function handleMediaHttp(options: {
  store: MediaStore
  method: string
  url: URL
  body?: unknown
}): Promise<MediaHttpResult | undefined> {
  if (options.url.pathname !== MEDIA_HTTP_PATH) return undefined

  const method = options.method.toUpperCase()
  if (method === "POST") {
    if (!isWriteRequest(options.body)) {
      return { status: 400, json: { error: "POST /v1/media requires { bytes, mediaType }" } }
    }
    const bytes = base64ToBytes(options.body.bytes)
    const ref = await options.store.write(
      bytes,
      {
        mediaType: options.body.mediaType,
        name: options.body.name,
        prefix: options.body.prefix,
      },
      {}
    )
    return { status: 200, json: ref }
  }

  if (method === "GET") {
    const uri = options.url.searchParams.get("uri")
    if (!uri) {
      return { status: 400, json: { error: "GET /v1/media requires ?uri=" } }
    }
    const ref: FileRef = { kind: FILE_REF_KINDS.ARTIFACT, uri }
    const resolved = await options.store.read(ref, {})
    const json: MediaHttpReadResponse = {
      bytes: bytesToBase64(resolved.bytes),
      mediaType: resolved.mediaType,
      name: resolved.name,
      sizeBytes: resolved.sizeBytes,
    }
    return { status: 200, json }
  }

  return { status: 405, json: { error: "Method not allowed" } }
}
