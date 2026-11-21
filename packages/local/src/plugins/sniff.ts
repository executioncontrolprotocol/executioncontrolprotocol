const SNIFF_LEN = 32

interface MagicRule {
  /** MIME type returned when matched. */
  mediaType: string
  /** Prefix bytes at the start of the file. */
  prefix?: number[]
  /** Prefix at a fixed offset. */
  at?: { offset: number; bytes: number[] }
}

const RULES: MagicRule[] = [
  { mediaType: "image/png", prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: "image/jpeg", prefix: [0xff, 0xd8, 0xff] },
  { mediaType: "image/gif", prefix: [0x47, 0x49, 0x46, 0x38] },
  { mediaType: "image/webp", prefix: [0x52, 0x49, 0x46, 0x46], at: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  { mediaType: "image/vnd.adobe.photoshop", prefix: [0x38, 0x42, 0x50, 0x53] },
  { mediaType: "application/pdf", prefix: [0x25, 0x50, 0x44, 0x46] },
  { mediaType: "video/mp4", at: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] } },
  { mediaType: "audio/mpeg", prefix: [0xff, 0xfb] },
  { mediaType: "audio/mpeg", prefix: [0x49, 0x44, 0x33] },
  { mediaType: "audio/wav", prefix: [0x52, 0x49, 0x46, 0x46], at: { offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] } },
  { mediaType: "application/zip", prefix: [0x50, 0x4b, 0x03, 0x04] },
]

/**
 * Return true when sniffing should run for the given media type.
 * @category Plugins
 */
export function shouldSniffMediaType(mediaType: string | undefined): boolean {
  if (!mediaType) return true
  const base = mediaType.split(";")[0]?.trim().toLowerCase() ?? ""
  if (base === "application/json") return false
  if (base.startsWith("text/")) return false
  return true
}

/**
 * Match the first bytes against the in-repo magic table.
 * @category Plugins
 */
export function sniffMediaType(head: Uint8Array): string | undefined {
  const slice = head.subarray(0, SNIFF_LEN)
  for (const rule of RULES) {
    if (rule.prefix && !matchesAt(slice, 0, rule.prefix)) continue
    if (rule.at && !matchesAt(slice, rule.at.offset, rule.at.bytes)) continue
    return rule.mediaType
  }
  return undefined
}

/**
 * Compare media types, ignoring parameters (`image/png; charset=binary` matches `image/png`).
 * @category Plugins
 */
export function mediaTypesEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const baseA = a.split(";")[0]?.trim().toLowerCase()
  const baseB = b.split(";")[0]?.trim().toLowerCase()
  return baseA === baseB
}

function matchesAt(buf: Uint8Array, offset: number, expected: number[]): boolean {
  if (buf.byteLength < offset + expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (buf[offset + index] !== expected[index]) return false
  }
  return true
}