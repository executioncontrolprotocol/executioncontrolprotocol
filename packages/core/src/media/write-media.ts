import { IMAGE_REF_KINDS, type ImageRef } from "@executioncontrolprotocol/types"
import {
  STORAGE_ARTIFACT_URI_PREFIX,
  type MediaCapabilityContext,
} from "./resolve-media.js"

/** Options for {@link writeMediaArtifact}. @category Media */
export interface WriteMediaArtifactOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** URI path prefix under `ecp://` (default `artifacts/media`). */
  prefix?: string
  /** When `"storage"`, write via `@executioncontrolprotocol/storage.write`. */
  store?: string
}

/**
 * Write bytes into the host artifact store (or durable storage) and return an artifact {@link ImageRef}.
 * @category Media
 */
export async function writeMediaArtifact(
  data: Uint8Array,
  options: WriteMediaArtifactOptions,
  ctx: MediaCapabilityContext
): Promise<ImageRef> {
  const cfg = ctx.extensionConfig ?? {}
  const storage = (cfg.storage as { outputPrefix?: string; defaultStore?: string } | undefined) ?? {}
  const prefix = options.prefix ?? storage.outputPrefix ?? "artifacts/media"
  const name = options.name ?? `media-${Date.now()}.bin`
  const uri = `ecp://${prefix}/${name}`

  if (options.store === "storage" || storage.defaultStore === "storage") {
    const key = `${prefix}/${name}`
    await ctx.capabilities.call("@executioncontrolprotocol/storage.write", {
      key,
      value: data,
    })
    return {
      kind: IMAGE_REF_KINDS.ARTIFACT,
      uri: `${STORAGE_ARTIFACT_URI_PREFIX}${key}`,
      mediaType: options.mediaType,
      name,
      sizeBytes: data.byteLength,
    }
  }

  if (!ctx.artifacts) {
    throw new Error(
      "No artifact store on capability context. Ensure the runtime wires ctx.artifacts (env.ensureArtifactStore)."
    )
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  ctx.artifacts.set(uri, {
    mediaType: options.mediaType,
    name,
    size: bytes.byteLength,
    bytes,
  })

  return {
    kind: IMAGE_REF_KINDS.ARTIFACT,
    uri,
    mediaType: options.mediaType,
    name,
    sizeBytes: bytes.byteLength,
  }
}
