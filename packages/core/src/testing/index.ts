/**
 * Test-extension entry for examples and unit tests.
 * Bind {@link testExtension} with `extension(testExtension)`.
 * @category Testing
 */
export { registerTestExtension, testExtension } from "./test-extension.js"
export {
  createMemoryMediaStore,
  type MemoryMediaStore,
  type MemoryMediaRecord,
} from "./memory-media-store.js"
