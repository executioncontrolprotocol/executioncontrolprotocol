import type { Metadata, Stats } from "sharp"

/** Derived image facts for branching. @category Extensions */
export interface DerivedImageFacts {
  aspectRatio?: number
  orientation: "landscape" | "portrait" | "square" | "unknown"
  megapixels?: number
}

/** Derive orientation and size facts from Sharp metadata. @category Extensions */
export function deriveImageFacts(metadata: Metadata, stats?: Stats): DerivedImageFacts {
  const width = metadata.width
  const height = metadata.height
  let orientation: DerivedImageFacts["orientation"] = "unknown"
  if (width !== undefined && height !== undefined) {
    if (width > height) orientation = "landscape"
    else if (height > width) orientation = "portrait"
    else orientation = "square"
  }
  const aspectRatio =
    width !== undefined && height !== undefined && height > 0 ? width / height : undefined
  const megapixels =
    width !== undefined && height !== undefined
      ? Math.round((width * height) / 1_000_000 * 100) / 100
      : undefined
  void stats
  return { aspectRatio, orientation, megapixels }
}
