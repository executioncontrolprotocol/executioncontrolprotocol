import {
  IMAGE_REF_KINDS,
  type ImageRef,
  type ImageRefKind,
} from "@executioncontrolprotocol/types"

/** Whether `value` is an {@link ImageRef}. @category Image */
export function isImageRef(value: unknown): value is ImageRef {
  if (value === null || typeof value !== "object") return false
  const kind = (value as { kind?: unknown }).kind
  return (
    kind === IMAGE_REF_KINDS.ARTIFACT ||
    kind === IMAGE_REF_KINDS.FILE ||
    kind === IMAGE_REF_KINDS.URL ||
    kind === IMAGE_REF_KINDS.BUFFER
  )
}

/** Collected image reference with JSON path for policy diagnostics. @category Image */
export interface CollectedImageRef {
  /** Path within the walked object (e.g. `image`, `variants[0].image`). */
  path: string
  /** The image reference. */
  ref: ImageRef
}

const IMAGE_REF_KIND_SET = new Set<string>(Object.values(IMAGE_REF_KINDS))

function isImageRefKind(value: unknown): value is ImageRefKind {
  return typeof value === "string" && IMAGE_REF_KIND_SET.has(value)
}

/** Depth-first collect of all {@link ImageRef} values in a payload. @category Image */
export function collectImageRefs(
  value: unknown,
  path = "",
  out: CollectedImageRef[] = []
): CollectedImageRef[] {
  if (isImageRef(value)) {
    out.push({ path: path || "$", ref: value })
    return out
  }
  if (value === null || typeof value !== "object") return out
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectImageRefs(value[i], path ? `${path}[${i}]` : `[${i}]`, out)
    }
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    collectImageRefs(child, childPath, out)
  }
  return out
}

/** Collected output format hint. @category Image */
export interface CollectedFormatHint {
  /** Path to the format field. */
  path: string
  /** Format value. */
  format: string
}

const FORMAT_KEYS = new Set(["format"])

/** Collect nested `format` and `info.format` string hints from output payloads. @category Image */
export function collectOutputFormatHints(
  value: unknown,
  path = "",
  out: CollectedFormatHint[] = []
): CollectedFormatHint[] {
  if (value === null || typeof value !== "object") return out
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectOutputFormatHints(value[i], path ? `${path}[${i}]` : `[${i}]`, out)
    }
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (FORMAT_KEYS.has(key) && typeof child === "string") {
      out.push({ path: childPath, format: child })
    }
    collectOutputFormatHints(child, childPath, out)
  }
  return out
}

/** Parse hostname from a URL image ref for domain policy checks. @category Image */
export function imageRefUrlHostname(ref: ImageRef): string | undefined {
  if (ref.kind !== IMAGE_REF_KINDS.URL) return undefined
  try {
    return new URL(ref.url).hostname
  } catch {
    return undefined
  }
}

/** Whether media type or format hint indicates SVG. @category Image */
export function isSvgHint(mediaTypeOrFormat: string | undefined): boolean {
  if (!mediaTypeOrFormat) return false
  const lower = mediaTypeOrFormat.toLowerCase()
  return lower === "svg" || lower === "image/svg+xml" || lower.endsWith("+svg")
}

export { isImageRefKind }
