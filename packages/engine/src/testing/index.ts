/**
 * In-memory services for tests. Not used by the host.
 * @category Environment
 */
export { FixturePluginAdapter } from "./plugins.js"
export type { FixtureHandler } from "./plugins.js"
export { MemoryArtifactStore } from "./artifact-store.js"
export { MemoryScratchSpace } from "./scratch-space.js"
export { MemorySecrets, MemoryStorage, StorageError } from "./memory.js"
export type { TextFileReader } from "./memory.js"
