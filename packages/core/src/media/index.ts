/**
 * Unified media resolve/write for extensions.
 * @packageDocumentation
 * @category Media
 */

export {
  resolveMedia,
  STORAGE_ARTIFACT_URI_PREFIX,
  type ResolvedMedia,
  type ResolveMediaOptions,
  type MediaCapabilityContext,
} from "./resolve-media.js"
export {
  writeMediaArtifact,
  type WriteMediaArtifactOptions,
} from "./write-media.js"
