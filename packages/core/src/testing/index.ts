/**
 * Test-extension entry for in-process tests. Production CLI loads the same
 * definition from `@executioncontrolprotocol/plugin-test` (not a Node default).
 * Bind {@link testExtension} with `extension(testExtension)`.
 * @category Testing
 */
export { registerTestExtension, testExtension } from "./test-extension.js"
export {
  createMemoryMediaStore,
  type MemoryMediaStore,
  type MemoryMediaRecord,
} from "./memory-media-store.js"
