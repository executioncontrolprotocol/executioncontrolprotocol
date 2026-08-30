/** Common MIME type → file extension (without dot). @category Media */
const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "application/json": "json",
  "application/pdf": "pdf",
  "application/octet-stream": "bin",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/html": "html",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/webm": "webm",
}

/**
 * File extension (no dot) for a MIME type, or `undefined` when unknown.
 * @category Media
 */
export function extensionForMediaType(mediaType: string): string | undefined {
  const normalized = mediaType.split(";")[0]?.trim().toLowerCase() ?? ""
  if (!normalized) return undefined
  const direct = MEDIA_TYPE_EXTENSIONS[normalized]
  if (direct) return direct
  const slash = normalized.indexOf("/")
  if (slash < 0) return undefined
  const major = normalized.slice(0, slash)
  const minor = normalized.slice(slash + 1)
  if (major === "image" || major === "video" || major === "audio") {
    return minor.replace(/^x-/, "").replace(/\+xml$/, "") || undefined
  }
  return undefined
}

/**
 * Default artifact filename when the caller does not supply one.
 * @category Media
 */
export function defaultArtifactFilename(mediaType: string): string {
  const ext = extensionForMediaType(mediaType) ?? "bin"
  return `media-${Date.now()}.${ext}`
}

function sanitizeFilenamePart(raw: string): string {
  const trimmed = raw.trim().replace(/["\\\r\n]/g, "")
  const safe = trimmed.replace(/[/\\]/g, "_")
  return safe || "artifact"
}

function filenameExtension(filename: string): string | undefined {
  const base = filename.split(/[/\\]/).pop() ?? filename
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot + 1).toLowerCase()
}

function filenameWithExtension(baseName: string, extension: string): string {
  const ext = extension.replace(/^\./, "")
  const withoutExt = baseName.replace(/\.[^./\\]+$/, "")
  return `${withoutExt}.${ext}`
}

/**
 * Resolve a safe download filename from stored metadata.
 * Prefers `name`, then the URI basename, and upgrades `.bin` / extensionless names using `mediaType`.
 * @category Media
 */
export function resolveArtifactFilename(
  name: string | undefined,
  uri: string,
  mediaType?: string
): string {
  const raw = name?.trim() || uri.split("/").pop() || "artifact"
  let filename = sanitizeFilenamePart(raw)
  const ext = filenameExtension(filename)
  const mediaExt = mediaType ? extensionForMediaType(mediaType) : undefined
  if (mediaExt && (!ext || ext === "bin")) {
    filename = filenameWithExtension(filename, mediaExt)
  }
  return filename || "artifact"
}

/** HTTP path prefix for host artifact GET routes. @category Media */
export const ARTIFACT_HTTP_PATH_PREFIX = "/v1/artifacts"

/**
 * Whether a request pathname targets {@link ARTIFACT_HTTP_PATH_PREFIX} (with optional filename segment).
 * @category Media
 */
export function isArtifactFetchPathname(pathname: string): boolean {
  return (
    pathname === ARTIFACT_HTTP_PATH_PREFIX ||
    pathname.startsWith(`${ARTIFACT_HTTP_PATH_PREFIX}/`)
  )
}

/**
 * Decode the optional filename segment from an artifact fetch pathname.
 * @category Media
 */
export function parseArtifactFetchPathname(pathname: string): string | undefined {
  const prefix = `${ARTIFACT_HTTP_PATH_PREFIX}/`
  if (!pathname.startsWith(prefix)) return undefined
  const raw = pathname.slice(prefix.length)
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}

/** Options for {@link artifactFetchPathname}. @category Media */
export interface ArtifactFetchPathnameOptions {
  /** Stored artifact display name. */
  name?: string
  /** Stored artifact MIME type. */
  mediaType?: string
}

/**
 * Build `/v1/artifacts/<filename>` so clients see an extension in the URL (not only headers).
 * @category Media
 */
export function artifactFetchPathname(
  uri: string,
  options?: ArtifactFetchPathnameOptions
): string {
  const filename = resolveArtifactFilename(options?.name, uri, options?.mediaType)
  return `${ARTIFACT_HTTP_PATH_PREFIX}/${encodeURIComponent(filename)}`
}
