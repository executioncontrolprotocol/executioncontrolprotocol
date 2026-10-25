/**
 * Unified file resolve/write for extensions.
 * @packageDocumentation
 * @category File
 */

export {
  resolveFile,
  requireMediaStore,
  mediaStoreContextFrom,
  DEFAULT_MEDIA_PREFIX,
  type ResolvedFile,
  type ResolveFileOptions,
  type FileCapabilityContext,
} from "./resolve-file.js"
export { writeMediaArtifact, type WriteMediaArtifactOptions } from "./write-media.js"
export { readBrowserLocator } from "./browser-locator.js"
export { bytesToBase64, base64ToBytes } from "./base64.js"
export {
  ARTIFACT_HTTP_PATH_PREFIX,
  artifactFetchPathname,
  defaultArtifactFilename,
  extensionForMediaType,
  isArtifactFetchPathname,
  parseArtifactFetchPathname,
  resolveArtifactFilename,
  type ArtifactFetchPathnameOptions,
} from "./artifact-filename.js"
