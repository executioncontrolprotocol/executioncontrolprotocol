/**
 * Declared file access on a capability JSON Schema (`x-ecp-file`).
 * @category Definitions
 */
export type FileRefAccess = "bytes" | "stream" | "path" | "url"

/**
 * `x-ecp-file` object form on a whole {@link FileRef} schema.
 * @category Definitions
 */
export interface XEcpFileAnnotation {
  /** Required handler access method; omitted means any {@link FileRef} kind. */
  access?: FileRefAccess
  /** Allowed `mediaType` values; `type/*` matches any subtype. */
  mediaTypes?: string[]
}

/**
 * Parse `x-ecp-file` from a JSON Schema fragment.
 * @category Definitions
 */
export function parseXEcpFile(schema: Record<string, unknown> | undefined): XEcpFileAnnotation | undefined {
  if (!schema) return undefined
  const raw = schema["x-ecp-file"]
  if (raw === true) return {}
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const access = record.access
  const mediaTypes = record.mediaTypes
  const out: XEcpFileAnnotation = {}
  if (access === "bytes" || access === "stream" || access === "path" || access === "url") {
    out.access = access
  }
  if (Array.isArray(mediaTypes) && mediaTypes.every((item) => typeof item === "string")) {
    out.mediaTypes = mediaTypes
  }
  return out
}

/**
 * Whether a schema marks a {@link FileRef} field (`x-ecp-file` or a `kind` enum).
 * @category Definitions
 */
export function isFileRefJsonSchema(schema: Record<string, unknown> | undefined): boolean {
  if (!schema) return false
  if (schema["x-ecp-file"] === true) return true
  if (parseXEcpFile(schema) !== undefined) return true
  const properties = schema.properties
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    const kind = (properties as Record<string, unknown>).kind
    if (typeof kind === "object" && kind !== null) {
      const kindRecord = kind as Record<string, unknown>
      if (kindRecord.const === "file" || kindRecord.const === "url" || kindRecord.const === "artifact") return true
      if (Array.isArray(kindRecord.enum) && kindRecord.enum.some((value) => value === "file" || value === "url" || value === "artifact")) {
        return true
      }
    }
  }
  const branches = [...branchList(schema.oneOf), ...branchList(schema.anyOf)]
  if (branches.length > 0) return branches.some((branch) => isFileRefJsonSchema(branch))
  return false
}

function branchList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
}

/**
 * Suggestion when a non-url {@link FileRef} is bound to a url-only field.
 * @category Definitions
 */
export const FILE_ACCESS_PUBLISH_SUGGESTION =
  "Publish the file first: add an upload step (for example @executioncontrolprotocol/azure-blob-storage.upload with createReadSas) and pass the URL it returns as a url FileRef."

/**
 * Compare a declared media type to an allow-list (supports `type/*` wildcards).
 * @category Definitions
 */
export function mediaTypeMatchesAllowList(declared: string, allowed: readonly string[]): boolean {
  const normalized = declared.split(";")[0]?.trim().toLowerCase() ?? ""
  if (!normalized) return false
  for (const pattern of allowed) {
    const p = pattern.trim().toLowerCase()
    if (!p) continue
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1)
      if (normalized.startsWith(prefix)) return true
    } else if (normalized === p) {
      return true
    }
  }
  return false
}