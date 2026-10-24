import type { Hook } from "@oclif/core"
import {
  ECP_PLUGINS_MISSING,
  EXIT_PLUGINS_MISSING,
  failureEnvelope,
} from "@executioncontrolprotocol/plugin-sdk"
import { argvHasFlag } from "../lib/argv.js"
import { confirm } from "../lib/confirm.js"

/**
 * Confirm, install a JIT plugin at its pinned range, then rerun the command.
 * @category CLI
 */
const hook: Hook<"jit_plugin_not_installed"> = async function (options) {
  const name = options.pluginName
  const tag = options.pluginVersion || "latest"
  if (!name) return
  const spec = `${name}@${tag}`
  const argv = process.argv.slice(2)
  const json = argvHasFlag(argv, "json")
  if (json) {
    this.log(
      JSON.stringify(
        failureEnvelope({
          code: ECP_PLUGINS_MISSING,
          message: `Plugin ${spec} is not installed.`,
          suggestions: [`ecp plugins install ${spec}`],
        })
      )
    )
    this.exit(EXIT_PLUGINS_MISSING)
  }
  const ok = await confirm(`Install ${spec} and continue?`, argv)
  if (!ok) {
    this.log(`Run: ecp plugins install ${spec}`)
    this.exit(EXIT_PLUGINS_MISSING)
  }
  await this.config.runCommand("plugins:install", [spec])
}

export default hook
