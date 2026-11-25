import type { FileRef } from "../schemas.js"
import { AdobeServiceError, INPUT_INVALID } from "../errors.js"

const MEDIA_TYPE_TOKEN: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/vnd.adobe.photoshop": "psd",
  "application/pdf": "pdf",
}

/** Path-safe key for a multi-output FileRef from its media type. @category Runtime */
export function mediaTypeToken(mediaType: string): string {
  const known = MEDIA_TYPE_TOKEN[mediaType.toLowerCase()]
  if (known) return known
  const slash = mediaType.indexOf("/")
  if (slash < 0) return "file"
  const sub = mediaType.slice(slash + 1).replace(/[^a-zA-Z0-9_-]+/g, "-")
  return sub || "file"
}

/**
 * Product-shape instructions emitted by the generator into operations.ts.
 * @category Runtime
 */
export type AdobeProductShape =
  | { kind: "image-job"; mediaArray: "images" }
  | { kind: "video-job"; mediaArray: "videos" }
  | { kind: "upscaler" }
  | { kind: "photoshop-multi" }
  | { kind: "manifest" }
  | { kind: "url-blob" }
  | { kind: "passthrough" }

/**
 * Last-resort media types when neither the response, the request nor the URL says. The OpenAPI specs
 * are silent on output formats. Firefly image jobs return JPEG (checked live against generate-images:
 * `content-type: image/jpeg`, extensionless URL); the upscaler default is unverified.
 */
const FAMILY_DEFAULT: Record<string, string> = {
  "image-job": "image/jpeg",
  upscaler: "image/png",
  "video-job": "video/mp4",
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseExtensionMediaType(url: string): string | undefined {
  try {
    const path = new URL(url).pathname
    const ext = path.split(".").pop()?.toLowerCase()
    if (ext === "png") return "image/png"
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
    if (ext === "webp") return "image/webp"
    if (ext === "psd") return "image/vnd.adobe.photoshop"
    if (ext === "pdf") return "application/pdf"
    if (ext === "mp4") return "video/mp4"
    if (ext === "mp3") return "audio/mpeg"
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * Resolve media type for a presigned asset URL (response → request → path → default).
 * @category Runtime
 */
export function resolveMediaType(options: {
  responseMediaType?: string
  requestedMediaType?: string
  url: string
  familyDefault?: string
}): string {
  if (options.responseMediaType) return options.responseMediaType
  if (options.requestedMediaType) return options.requestedMediaType
  const fromPath = parseExtensionMediaType(options.url)
  if (fromPath) return fromPath
  return options.familyDefault ?? "application/octet-stream"
}

function urlFileRef(url: string, mediaType: string): FileRef {
  return { kind: "url", url, mediaType }
}

function extractUrl(blob: unknown): string | undefined {
  if (!isPlainObject(blob)) return undefined
  if (typeof blob.url === "string") return blob.url
  const dest = blob.destination
  if (isPlainObject(dest) && typeof dest.url === "string") return dest.url
  const image = blob.image
  if (isPlainObject(image) && typeof image.url === "string") return image.url
  const video = blob.video
  if (isPlainObject(video) && typeof video.url === "string") return video.url
  return undefined
}

function requestOutputMediaTypes(input: Record<string, unknown>): string[] {
  const raw = input.outputs ?? (isPlainObject(input.body) ? input.body.outputs : undefined)
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    if (!isPlainObject(entry)) return ""
    if (typeof entry.mediaType === "string") return entry.mediaType
    const dest = entry.destination
    if (isPlainObject(dest) && typeof dest.mediaType === "string") return dest.mediaType
    return ""
  })
}

/**
 * Turn the Adobe API document into the capability's product-shaped output.
 * @category Runtime
 */
export function shapeAdobeOutput(
  raw: unknown,
  shape: AdobeProductShape | undefined,
  input: Record<string, unknown>,
): unknown {
  if (!shape || shape.kind === "passthrough") return raw
  if (!isPlainObject(raw)) return raw

  switch (shape.kind) {
    case "manifest": {
      const outputs = raw.outputs
      if (!Array.isArray(outputs) || outputs.length === 0) return raw
      const first = outputs[0]
      if (!isPlainObject(first)) return raw
      if (Array.isArray(first.layers) || isPlainObject(first.document)) return first
      const content = first.content ?? (isPlainObject(first.destination) ? first.destination.content : undefined)
      if (isPlainObject(content)) return content
      return raw
    }
    case "image-job":
    case "video-job": {
      const mediaKey = shape.mediaArray
      const prop = shape.kind === "video-job" ? "video" : "image"
      const outputs = raw.outputs
      if (!Array.isArray(outputs)) return { [mediaKey]: [] }
      const images: FileRef[] = []
      const seeds: number[] = []
      for (const entry of outputs) {
        if (!isPlainObject(entry)) continue
        if (typeof entry.seed === "number") seeds.push(entry.seed)
        const asset = entry[prop]
        const url = extractUrl(asset) ?? (isPlainObject(entry) ? extractUrl(entry) : undefined)
        if (!url) continue
        const mt =
          (isPlainObject(asset) && typeof asset.mediaType === "string" ? asset.mediaType : undefined) ??
          resolveMediaType({ url, familyDefault: FAMILY_DEFAULT[shape.kind] })
        images.push(urlFileRef(url, mt))
      }
      return {
        [mediaKey]: images,
        ...(seeds.length ? { seeds } : {}),
        ...(raw.size !== undefined ? { size: raw.size } : {}),
        ...(typeof raw.contentClass === "string" ? { contentClass: raw.contentClass } : {}),
      }
    }
    case "upscaler": {
      const url = typeof raw.presignedUrl === "string" ? raw.presignedUrl : extractUrl(raw)
      if (!url) return { images: [] }
      const mt = resolveMediaType({
        responseMediaType: typeof raw.mediaType === "string" ? raw.mediaType : undefined,
        url,
        familyDefault: FAMILY_DEFAULT.upscaler,
      })
      return { images: [urlFileRef(url, mt)] }
    }
    case "photoshop-multi": {
      const outputs = raw.outputs
      if (!Array.isArray(outputs)) return {}
      const requested = requestOutputMediaTypes(input)
      const out: Record<string, FileRef> = {}
      const tokenCounts = new Map<string, number>()
      outputs.forEach((entry, index) => {
        if (!isPlainObject(entry)) return
        const dest = entry.destination
        const url = extractUrl(entry) ?? (isPlainObject(dest) ? extractUrl(dest) : undefined)
        if (!url) return
        const responseMt =
          (typeof entry.mediaType === "string" ? entry.mediaType : undefined) ??
          (isPlainObject(dest) && typeof dest.mediaType === "string" ? dest.mediaType : undefined)
        const requestedMt = requested[index]
        const mt = resolveMediaType({
          responseMediaType: responseMt,
          requestedMediaType: requestedMt,
          url,
          familyDefault: "image/png",
        })
        let token = mediaTypeToken(mt)
        const seen = tokenCounts.get(token) ?? 0
        tokenCounts.set(token, seen + 1)
        if (seen > 0) token = `${token}${seen + 1}`
        out[token] = urlFileRef(url, mt)
      })
      return out
    }
    case "url-blob": {
      const out: Record<string, unknown> = { ...raw }
      for (const [key, value] of Object.entries(raw)) {
        const url = typeof value === "string" && /^https?:\/\//.test(value) ? value : extractUrl(value)
        if (url) {
          out[key] = urlFileRef(url, resolveMediaType({ url }))
        }
      }
      if (typeof raw.presignedUrl === "string") {
        out.presignedUrl = urlFileRef(raw.presignedUrl, resolveMediaType({ url: raw.presignedUrl }))
      }
      return out
    }
    default:
      return raw
  }
}

const FILE_REF_UPLOAD_HINT =
  "upload it to allowlisted storage first, then pass a url FileRef (kind: url with a signed or public https URL)."

function assertUrlFileRef(value: unknown, path: string): Extract<FileRef, { kind: "url" }> {
  if (!isPlainObject(value) || value.kind !== "url" || typeof value.url !== "string") {
    throw new AdobeServiceError(INPUT_INVALID, `Adobe accepts url FileRefs only; ${FILE_REF_UPLOAD_HINT}`, {
      issues: [{ path, message: `Expected a url FileRef at ${path}.` }],
      suggestions: [FILE_REF_UPLOAD_HINT],
    })
  }
  return {
    kind: "url",
    url: value.url,
    ...(isPlainObject(value.headers) ? { headers: value.headers as Record<string, string> } : {}),
    ...(typeof value.mediaType === "string" ? { mediaType: value.mediaType } : {}),
  }
}

function expandFileRefToAdobeEnvelope(ref: Extract<FileRef, { kind: "url" }>, envelopeKey: "source"): Record<string, unknown> {
  return { [envelopeKey]: { url: ref.url } }
}

/**
 * Expand url FileRefs in capability input into Adobe request envelopes before HTTP.
 * @category Runtime
 */
export function expandFileRefInputs(input: Record<string, unknown>, bodyFields: readonly string[]): Record<string, unknown> {
  const out = { ...input }
  for (const field of bodyFields) {
    const value = out[field]
    if (value === undefined) continue
    if (isPlainObject(value) && value.kind !== undefined) {
      if (value.kind !== "url") {
        throw new AdobeServiceError(INPUT_INVALID, `Adobe accepts url FileRefs only; ${FILE_REF_UPLOAD_HINT}`, {
          issues: [{ path: field, message: `kind must be "url".` }],
          suggestions: [FILE_REF_UPLOAD_HINT],
        })
      }
      const ref = assertUrlFileRef(value, field)
      out[field] = expandFileRefToAdobeEnvelope(ref, "source")
    }
  }
  return out
}

/**
 * Whether a value is a url {@link FileRef} (not an Adobe API envelope).
 * @category Runtime
 */
function isUrlFileRef(value: unknown): value is Extract<FileRef, { kind: "url" }> {
  return isPlainObject(value) && value.kind === "url"
}

/**
 * Walk nested capability input and expand url FileRefs into Adobe request shapes.
 * @category Runtime
 */
export function expandNestedFileRefPayload(value: unknown, path = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => expandNestedFileRefPayload(entry, `${path}[${index}]`))
  }
  if (!isPlainObject(value)) return value

  const out: Record<string, unknown> = {}
  const fileLikeKeys = new Set(["imageReference", "image", "source", "smartObjectFile"])
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (fileLikeKeys.has(key) && isPlainObject(child) && child.kind !== undefined && !isUrlFileRef(child)) {
      throw new AdobeServiceError(INPUT_INVALID, `Adobe accepts url FileRefs only; ${FILE_REF_UPLOAD_HINT}`, {
        issues: [{ path: childPath, message: `kind must be "url".` }],
        suggestions: [FILE_REF_UPLOAD_HINT],
      })
    }
    if (isUrlFileRef(child)) {
      const ref = assertUrlFileRef(child, childPath)
      if (key === "imageReference") {
        out[key] = expandFileRefToAdobeEnvelope(ref, "source")
      } else if (key === "image" || key === "smartObjectFile") {
        out[key] = { source: { url: ref.url } }
      } else if (key === "source") {
        out[key] = { url: ref.url }
      } else {
        throw new AdobeServiceError(INPUT_INVALID, `Unexpected url FileRef at ${childPath}.`, {
          issues: [{ path: childPath, message: "FileRef is not valid at this path." }],
        })
      }
      continue
    }
    out[key] = expandNestedFileRefPayload(child, childPath)
  }
  return out
}