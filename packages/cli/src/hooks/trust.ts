import type { Hook } from "@oclif/core"
import { failureEnvelope } from "@executioncontrolprotocol/plugin-sdk"
import { EcpCliError } from "@executioncontrolprotocol/plugin-sdk"
import { argvHasFlag } from "../lib/argv.js"
import { assertTrusted } from "../lib/evaluate-trust.js"

interface PreinstallOptions {
  plugin: { name?: string; url?: string; tag?: string; type?: string }
}

/**
 * Trust check before `plugins:install`. First-party npm packages are allowed;
 * third-party packages need a prompt, `--yes`, or a remembered decision.
 * @category CLI
 */
const hook: Hook<"plugins:preinstall"> = async function (options) {
  const plugin = (options as unknown as PreinstallOptions).plugin
  const spec = plugin?.url || plugin?.name
  if (!spec) return
  try {
    await assertTrusted(this.config, spec, process.argv.slice(2))
  } catch (err) {
    if (err instanceof EcpCliError) {
      if (argvHasFlag(process.argv, "json")) {
        this.log(JSON.stringify(failureEnvelope(err.toBody())))
      } else {
        this.error(err.message, { exit: err.exitCode })
      }
      this.exit(err.exitCode)
    }
    throw err
  }
}

export default hook
