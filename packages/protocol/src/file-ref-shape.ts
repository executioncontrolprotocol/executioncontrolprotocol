import type { ArtifactFileRef, FileRef } from "./plugins.js"
import type { CapturedFileSource } from "./objects.js"

function stripUrlQuery(raw: string): string {
  try {
    const parsed = new URL(raw)
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return raw.split("?")[0]?.split("#")[0] ?? raw
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Whether `value` is a {@link FileRef} by shape (`kind` plus `url`, `path`, or `uri`).
 * @category Plugins
 */
export function isFileRefValue(value: unknown): value is FileRef {
  if (!isRecord(value) || typeof value.kind !== "string") return false
  if (value.kind === "file") return typeof value.path === "string" && value.path.length > 0
  if (value.kind === "url") return typeof value.url === "string" && value.url.length > 0
  if (value.kind === "artifact") return typeof value.uri === "string" && value.uri.length > 0
  return false
}

/**
 * Visit every {@link FileRef} nested in JSON output.
 * @category Plugins
 */
export function walkFileRefs(root: unknown, visit: (ref: FileRef, path: string) => void): void {
  const walk = (value: unknown, pointer: string): void => {
    if (isFileRefValue(value)) {
      visit(value, pointer)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${pointer}/${index}`))
      return
    }
    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        walk(child, pointer ? `${pointer}/${key}` : key)
      }
    }
  }
  walk(root, "")
}

/**
 * Source snapshot stored on a captured file record (query strings stripped from urls).
 * @category Definitions
 */
export function captureSourceFromRef(ref: FileRef): CapturedFileSource {
  if (ref.kind === "url") {
    return { kind: "url", url: stripUrlQuery(ref.url) }
  }
  if (ref.kind === "file") {
    return { kind: "file", path: ref.path }
  }
  return { kind: "artifact", uri: ref.uri }
}

/**
 * Optional `archive` on any {@link FileRef}; omitted when capture failed.
 * @category Plugins
 */
export type FileRefWithArchive = FileRef & { archive?: ArtifactFileRef }