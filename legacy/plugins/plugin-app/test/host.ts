import { extension, testExtension, type EnvironmentBinding } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Build a Node host for plugin-app unit tests.
 * @category App
 */
export async function testHost(extra: EnvironmentBinding[] = []) {
  const env = environment(NODE_ENVIRONMENT_ID, "app-test").with([
    extension(testExtension, "Test").with({}),
    ...extra,
  ])
  const ecp = await env.init()
  const host: EcpHost = {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
  }
  return { env, ecp, host }
}

/** Fluent echo workflow used as an App fixture. @category App */
export const ECHO_SOURCE = `import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Echo").run([
  step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out"),
])
`
