import { testExtension } from "@executioncontrolprotocol/core"

/**
 * First-party stub capabilities (echo and placeholders) for examples and tests.
 * Not a Node default. Bind with `extension(testExtension)` or
 * `ecp plugins link plugins/plugin-test`.
 * @category Extensions
 */
export { testExtension }

/**
 * Default export of {@link testExtension} for oclif `ecp.extension`.
 * @category Extensions
 */
export default testExtension
