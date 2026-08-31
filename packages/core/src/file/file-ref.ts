import {
  FILE_REF_KINDS,
  type FileRef,
  type FileRefKind,
} from "@executioncontrolprotocol/types"

/** Whether `value` is a {@link FileRef}. @category File */
export function isFileRef(value: unknown): value is FileRef {
  if (value === null || typeof value !== "object") return false
  const kind = (value as { kind?: unknown }).kind
  return (
    kind === FILE_REF_KINDS.ARTIFACT ||
    kind === FILE_REF_KINDS.FILE ||
    kind === FILE_REF_KINDS.URL ||
    kind === FILE_REF_KINDS.BUFFER
  )
}

/** Collected file reference with JSON path for policy diagnostics. @category File */
export interface CollectedFileRef {
  /** Path within the walked object (e.g. `image`, `variants[0].image`). */
  path: string
  /** The file reference. */
  ref: FileRef
}

const FILE_REF_KIND_SET = new Set<string>(Object.values(FILE_REF_KINDS))

/** Whether a string is a known {@link FileRefKind}. @category File */
export function isFileRefKind(value: unknown): value is FileRefKind {
  return typeof value === "string" && FILE_REF_KIND_SET.has(value)
}

/** Depth-first collect of all {@link FileRef} values in a payload. @category File */
export function collectFileRefs(
  value: unknown,
  path = "",
  out: CollectedFileRef[] = []
): CollectedFileRef[] {
  if (isFileRef(value)) {
    out.push({ path: path || "$", ref: value })
    return out
  }
  if (value === null || typeof value !== "object") return out
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectFileRefs(value[i], path ? `${path}[${i}]` : `[${i}]`, out)
    }
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    collectFileRefs(child, childPath, out)
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

/** Parse hostname from a URL file ref for domain policy checks. @category File */
export function fileRefUrlHostname(ref: FileRef): string | undefined {
  if (ref.kind !== FILE_REF_KINDS.URL) return undefined
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
