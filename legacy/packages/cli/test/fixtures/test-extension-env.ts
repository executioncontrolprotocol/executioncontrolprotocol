import { extension, testExtension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

/**
 * Opt-in Node host for spawn CLI tests that need `test.echo`.
 * Production users install or link `@executioncontrolprotocol/plugin-test`.
 * @category CLI
 */
export default environment(NODE_ENVIRONMENT_ID, "cli-test-echo").with([
  extension(testExtension),
])
