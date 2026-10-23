import type { Hook } from "@oclif/core"
import { NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { setHost } from "@executioncontrolprotocol/plugin-sdk"
import { createProcessEnvironment } from "../lib/plugin-bindings.js"

/**
 * Create the process-wide ECP host from installed plugin definitions.
 * @category CLI
 */
const hook: Hook<"init"> = async function (options) {
  const argv = options.argv ?? process.argv
  if (
    !options.id ||
    options.id === "help" ||
    options.id === "version" ||
    argv.includes("--help") ||
    argv.includes("-h")
  ) {
    return
  }
  const env = await createProcessEnvironment(options.config)
  const ecp = await env.init()
  setHost({
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
  })
}

export default hook
