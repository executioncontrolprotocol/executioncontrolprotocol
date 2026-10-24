/** Supported image output formats. @category Image */
export const IMAGE_OUTPUT_FORMATS = {
  JPEG: "jpeg",
  PNG: "png",
  WEBP: "webp",
  AVIF: "avif",
  TIFF: "tiff",
  GIF: "gif",
  RAW: "raw",
} as const

/** Image output format union. @category Image */
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[keyof typeof IMAGE_OUTPUT_FORMATS]

/** Image processing output info summary. @category Image */
export interface ImageOutputInfo {
  /** Output format. */
  format: string
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
  /** Channel count. */
  channels: number
  /** Output size in bytes. */
  sizeBytes: number
  /** Premultiplied alpha when relevant. */
  premultiplied?: boolean
  /** Crop offset when relevant. */
  cropOffsetLeft?: number
  /** Crop offset when relevant. */
  cropOffsetTop?: number
}
