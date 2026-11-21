/**
 * Local host services: plugins, storage and secrets.
 * @category Services
 */
export { VERSION } from "./version.js"
export { LocalPluginRegistration } from "./plugins/registration.js"
export type { LocalPluginRegistrationOptions } from "./plugins/registration.js"
export { discoverPluginRoots } from "./plugins/discover.js"
export type { DiscoveredPlugin } from "./plugins/discover.js"
export { loadPluginPackage, loadPluginSchemaDocument } from "./plugins/load-manifest.js"
export type { LoadedPluginPackage } from "./plugins/load-manifest.js"
export { createFileService, resolveFileRefPath, stripUrlForDisplay } from "./plugins/files.js"
export type { CreateFileServiceOptions, FileService } from "./plugins/files.js"
export { LocalArtifactStore } from "./storage/artifact-store.js"
export { LocalScratchSpace } from "./storage/scratch-space.js"
export { validateCapabilityInput } from "./plugins/validate-input.js"
export { LocalStorage } from "./storage/storage.js"
export { LocalRunStore } from "./storage/run-store.js"
export { StorageError } from "./storage/errors.js"
export {
  atomicWriteText,
  renameWithRetry,
  withFileLock,
  ATOMIC_CONSTANTS,
  setRenameImplForTests,
  type WithFileLockOptions,
} from "./storage/atomic.js"
export { HomePaths, EXECUTION_FILE_MAX_BYTES, SCRIPT_FILE_MAX_BYTES, stableStringify } from "./storage/paths.js"
export { LocalSecrets, envNameForKey, canonicalSecretKey } from "./secrets/secrets.js"
