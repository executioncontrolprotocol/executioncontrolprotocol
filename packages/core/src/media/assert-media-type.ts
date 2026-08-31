/**
 * Assert resolved media type matches allowed MIME type(s), including wildcards (`image/*`).
 * @category Media
 */
export function assertMediaType(
  resolvedMediaType: string | undefined,
  allowed: string | string[]
): void {
  const allowedList = Array.isArray(allowed) ? allowed : [allowed]
  if (allowedList.length === 0) {
    throw new Error("assertMediaType requires at least one allowed MIME type")
  }
  const mediaType = resolvedMediaType?.trim()
  if (!mediaType) {
    throw new Error("Resolved media type is missing or empty")
  }
  const normalized = mediaType.toLowerCase()
  for (const entry of allowedList) {
    const pattern = entry.trim().toLowerCase()
    if (!pattern) continue
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1)
      if (normalized.startsWith(prefix)) return
      continue
    }
    if (normalized === pattern) return
  }
  throw new Error(
    `Media type "${mediaType}" is not allowed (expected ${allowedList.join(" or ")})`
  )
}

/**
 * Whether a resolved media type matches allowed MIME type(s).
 * @category Media
 */
export function mediaTypeMatches(
  resolvedMediaType: string | undefined,
  allowed: string | string[]
): boolean {
  try {
    assertMediaType(resolvedMediaType, allowed)
    return true
  } catch {
    return false
  }
}
