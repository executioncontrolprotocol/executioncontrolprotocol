import { z } from "zod"

/** Portable image reference kinds. @category Image */
export const IMAGE_REF_KINDS = {
  ARTIFACT: "artifact",
  FILE: "file",
  URL: "url",
  BUFFER: "buffer",
} as const

/** Image reference kind union. @category Image */
export type ImageRefKind = (typeof IMAGE_REF_KINDS)[keyof typeof IMAGE_REF_KINDS]

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

/** Artifact-backed image reference. @category Image */
export interface ArtifactImageRef {
  /** Reference kind. */
  kind: typeof IMAGE_REF_KINDS.ARTIFACT
  /** Artifact URI (e.g. ecp://artifacts/input). */
  uri: string
  /** Optional MIME type. */
  mediaType?: string
  /** Optional display name. */
  name?: string
  /** Optional byte size when known. */
  sizeBytes?: number
}

/** Filesystem image reference (Node runtime). @category Image */
export interface FileImageRef {
  /** Reference kind. */
  kind: typeof IMAGE_REF_KINDS.FILE
  /** Absolute or relative file path. */
  path: string
  /** Optional MIME type. */
  mediaType?: string
  /** Optional byte size when known. */
  sizeBytes?: number
}

/** Remote URL image reference. @category Image */
export interface UrlImageRef {
  /** Reference kind. */
  kind: typeof IMAGE_REF_KINDS.URL
  /** Image URL. */
  url: string
  /** Optional request headers. */
  headers?: Record<string, string>
  /** Optional MIME type. */
  mediaType?: string
}

/** In-memory buffer image reference (runtime/tests; not manifest-portable). @category Image */
export interface BufferImageRef {
  /** Reference kind. */
  kind: typeof IMAGE_REF_KINDS.BUFFER
  /** Base64-encoded image bytes. */
  data: string
  /** Optional MIME type. */
  mediaType?: string
}

/** Portable image reference for workflow steps. @category Image */
export type ImageRef = ArtifactImageRef | FileImageRef | UrlImageRef | BufferImageRef

/** Zod schema for {@link ImageRef}. @category Image */
export const imageRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(IMAGE_REF_KINDS.ARTIFACT),
    uri: z.string(),
    mediaType: z.string().optional(),
    name: z.string().optional(),
    sizeBytes: z.number().optional(),
  }),
  z.object({
    kind: z.literal(IMAGE_REF_KINDS.FILE),
    path: z.string(),
    mediaType: z.string().optional(),
    sizeBytes: z.number().optional(),
  }),
  z.object({
    kind: z.literal(IMAGE_REF_KINDS.URL),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    mediaType: z.string().optional(),
  }),
  z.object({
    kind: z.literal(IMAGE_REF_KINDS.BUFFER),
    data: z.string(),
    mediaType: z.string().optional(),
  }),
])

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
