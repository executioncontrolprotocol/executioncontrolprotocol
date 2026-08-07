import {
  collectImageRefs,
  collectOutputFormatHints,
  imageRefUrlHostname,
  isSvgHint,
} from "@executioncontrolprotocol/core"
import { IMAGE_REF_KINDS } from "@executioncontrolprotocol/types"

/** Image policy configuration shape. @category Policies */
export interface ImagePolicyConfig {
  allowedInputKinds?: Array<"artifact" | "file" | "url" | "buffer">
  allowedOutputFormats?: Array<"jpeg" | "png" | "webp" | "avif" | "tiff" | "gif" | "raw">
  maxImageRefsPerStep?: number
  maxInputBytes?: number
  maxOutputBytes?: number
  maxPixels?: number
  maxWidth?: number
  maxHeight?: number
  allowSvg?: boolean
  allowRemoteUrls?: boolean
  allowedUrlDomains?: string[]
  requireStripMetadata?: boolean
  denyRawOutput?: boolean
}

/** Evaluate image refs in step input against policy config. @category Policies */
export function evaluateImageRefsPre(
  input: Record<string, unknown>,
  config: ImagePolicyConfig
): string | undefined {
  const refs = collectImageRefs(input)
  if (config.maxImageRefsPerStep !== undefined && refs.length > config.maxImageRefsPerStep) {
    return `Image ref count ${refs.length} exceeds maxImageRefsPerStep (${config.maxImageRefsPerStep})`
  }

  for (const { path, ref } of refs) {
    if (config.allowedInputKinds && !config.allowedInputKinds.includes(ref.kind)) {
      return `Image ref at ${path} has disallowed kind '${ref.kind}'`
    }
    if (ref.kind === IMAGE_REF_KINDS.URL) {
      if (config.allowRemoteUrls === false) {
        return `Remote URL image ref at ${path} is not allowed`
      }
      const host = imageRefUrlHostname(ref)
      if (config.allowedUrlDomains?.length && host && !config.allowedUrlDomains.includes(host)) {
        return `URL domain '${host}' at ${path} is not in allowedUrlDomains`
      }
    }
    const sizeBytes = "sizeBytes" in ref ? ref.sizeBytes : undefined
    if (sizeBytes !== undefined && config.maxInputBytes !== undefined && sizeBytes > config.maxInputBytes) {
      return `Image ref at ${path} exceeds maxInputBytes`
    }
    const mediaType = "mediaType" in ref ? ref.mediaType : undefined
    if (config.allowSvg === false && isSvgHint(mediaType)) {
      return `SVG input at ${path} is not allowed`
    }
  }

  if (config.requireStripMetadata === true && input.output && typeof input.output === "object") {
    const out = input.output as { stripMetadata?: boolean; preserveMetadata?: boolean }
    if (out.stripMetadata === false || out.preserveMetadata === true) {
      return "Metadata retention is not allowed by image-policy"
    }
  }

  return undefined
}

/** Evaluate image output against policy config. @category Policies */
export function evaluateImageRefsPost(
  output: unknown,
  config: ImagePolicyConfig
): string | undefined {
  if (output === null || typeof output !== "object") return undefined

  const refs = collectImageRefs(output)
  for (const { path, ref } of refs) {
    const sizeBytes = "sizeBytes" in ref ? ref.sizeBytes : undefined
    if (sizeBytes !== undefined && config.maxOutputBytes !== undefined && sizeBytes > config.maxOutputBytes) {
      return `Output image ref at ${path} exceeds maxOutputBytes`
    }
  }

  const info = (output as { info?: { format?: string; width?: number; height?: number; sizeBytes?: number } }).info
  if (info) {
    if (info.sizeBytes !== undefined && config.maxOutputBytes !== undefined && info.sizeBytes > config.maxOutputBytes) {
      return "Output sizeBytes exceeds maxOutputBytes"
    }
    if (
      info.width !== undefined &&
      info.height !== undefined &&
      config.maxPixels !== undefined &&
      info.width * info.height > config.maxPixels
    ) {
      return "Output dimensions exceed maxPixels"
    }
    if (info.width !== undefined && config.maxWidth !== undefined && info.width > config.maxWidth) {
      return "Output width exceeds maxWidth"
    }
    if (info.height !== undefined && config.maxHeight !== undefined && info.height > config.maxHeight) {
      return "Output height exceeds maxHeight"
    }
  }

  const formats = collectOutputFormatHints(output)
  for (const { path, format } of formats) {
    if (config.denyRawOutput === true && format === "raw") {
      return `Raw output format at ${path} is denied`
    }
    if (
      config.allowedOutputFormats &&
      !config.allowedOutputFormats.includes(format as (typeof config.allowedOutputFormats)[number])
    ) {
      return `Output format '${format}' at ${path} is not allowed`
    }
    if (config.allowSvg === false && isSvgHint(format)) {
      return `SVG output at ${path} is not allowed`
    }
  }

  return undefined
}
