import { extension, testExtension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * In-process CLI host with `test.echo` bound (not a Node default).
 * @category CLI
 */
export async function createEchoHost(): Promise<EcpHost> {
  const ecp = await environment(NODE_ENVIRONMENT_ID, "cli-inprocess-echo")
    .with([extension(testExtension)])
    .init()
  return {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
  }
}
