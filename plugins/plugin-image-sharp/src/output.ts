import type { Sharp } from "sharp"
import type { OutputOptions } from "./schemas.js"

/** Apply output encoding options to a Sharp instance. @category Extensions */
export function applyOutputOptions(
  instance: Sharp,
  output: OutputOptions | undefined,
  defaults: OutputOptions
): Sharp {
  const merged = { ...defaults, ...output }
  const format = merged.format ?? "webp"

  if (merged.stripMetadata === true && merged.preserveMetadata !== true) {
    instance = instance.withMetadata({})
  }

  switch (format) {
    case "jpeg":
      return instance.jpeg({
        quality: merged.quality,
        progressive: merged.progressive,
        mozjpeg: true,
      })
    case "png":
      return instance.png({
        compressionLevel: merged.compressionLevel,
        progressive: merged.progressive,
      })
    case "webp":
      return instance.webp({
        quality: merged.quality,
        effort: merged.effort,
        lossless: merged.lossless,
        nearLossless: merged.nearLossless,
      })
    case "avif":
      return instance.avif({
        quality: merged.quality,
        effort: merged.effort,
        lossless: merged.lossless,
      })
    case "tiff":
      return instance.tiff({ quality: merged.quality })
    case "gif":
      return instance.gif()
    case "raw":
      return instance.raw()
    default:
      return instance.webp({ quality: merged.quality })
  }
}
