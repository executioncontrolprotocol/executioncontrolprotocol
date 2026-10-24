import type { Hook, Interfaces } from "@oclif/core"
import { NODE_ENVIRONMENT_ID, writeInvokeJournal } from "@executioncontrolprotocol/node"
import { setHost, type EcpHost } from "@executioncontrolprotocol/plugin-sdk"
import { createProcessEnvironment } from "../lib/plugin-bindings.js"

async function reloadUserPlugins(config: Interfaces.Config): Promise<void> {
  const loader = config as Interfaces.Config & {
    loadPluginsAndCommands?: (opts?: { force: boolean }) => Promise<void>
  }
  await loader.loadPluginsAndCommands?.({ force: true })
}

async function createHost(config: Interfaces.Config): Promise<EcpHost> {
  const env = await createProcessEnvironment(config)
  const ecp = await env.init()
  const host: EcpHost = {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
    recordInvoke: async (entry) => {
      await writeInvokeJournal(entry)
    },
    rebuild: async () => {
      await ecp.terminate()
      await reloadUserPlugins(config)
      const next = await createHost(config)
      setHost(next)
      return next
    },
  }
  return host
}

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
  setHost(await createHost(options.config))
}

export default hook
