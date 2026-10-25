import { FILE_REF_KINDS, type FileRef } from "../types/index.js"
import { DEFAULT_MEDIA_PREFIX } from "../services/media-store.js"
import { defaultArtifactFilename } from "./artifact-filename.js"
import {
  mediaStoreContextFrom,
  requireMediaStore,
  type FileCapabilityContext,
} from "./resolve-file.js"

/** Options for {@link writeMediaArtifact}. @category Media */
export interface WriteMediaArtifactOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** URI path prefix under the store (default {@link DEFAULT_MEDIA_PREFIX}). */
  prefix?: string
}

function outputPrefixFromConfig(cfg: Record<string, unknown>): string | undefined {
  const artifacts = cfg.artifacts as { outputPrefix?: string } | undefined
  return typeof artifacts?.outputPrefix === "string" ? artifacts.outputPrefix : undefined
}

/**
 * Write bytes through the bound {@link MediaStore} and return an artifact {@link FileRef}.
 * @category Media
 */
export async function writeMediaArtifact(
  data: Uint8Array,
  options: WriteMediaArtifactOptions,
  ctx: FileCapabilityContext
): Promise<FileRef> {
  const cfg = ctx.extensionConfig ?? {}
  const prefix = options.prefix ?? outputPrefixFromConfig(cfg) ?? DEFAULT_MEDIA_PREFIX
  const name = options.name ?? defaultArtifactFilename(options.mediaType)
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const store = requireMediaStore(ctx)
  const ref = await store.write(bytes, { mediaType: options.mediaType, name, prefix }, mediaStoreContextFrom(ctx))

  if (ctx.artifacts && ref.kind === FILE_REF_KINDS.ARTIFACT) {
    ctx.artifacts.set(ref.uri, {
      mediaType: options.mediaType,
      name,
      size: bytes.byteLength,
      bytes,
    })
  }

  return ref
}
