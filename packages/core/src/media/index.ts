/**
 * Unified file resolve/write for extensions.
 * @packageDocumentation
 * @category File
 */

export {
  resolveFile,
  STORAGE_ARTIFACT_URI_PREFIX,
  type ResolvedFile,
  type ResolveFileOptions,
  type FileCapabilityContext,
} from "./resolve-file.js"
export {
  writeMediaArtifact,
  type WriteMediaArtifactOptions,
} from "./write-media.js"
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
