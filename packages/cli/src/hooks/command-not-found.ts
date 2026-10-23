import type { Hook } from "@oclif/core"
import {
  ECP_PLUGINS_MISSING,
  EXIT_PLUGINS_MISSING,
  failureEnvelope,
} from "@executioncontrolprotocol/plugin-sdk"
import { argvHasFlag } from "../lib/argv.js"
import { confirm } from "../lib/confirm.js"

function firstToken(id: string | undefined): string {
  if (!id) return ""
  return id.split(":")[0] ?? id
}

/**
 * Map an unknown topic to a first-party plugin, or redirect `ecp plugin` to `ecp plugins`.
 * @category CLI
 */
const hook: Hook<"command_not_found"> = async function (options) {
  const id = options.id ?? ""
  const argv = options.argv ?? []
  const json = argvHasFlag(argv, "json")

  if (id === "plugin" || id.startsWith("plugin:")) {
    const rest =
      id === "plugin"
        ? argv.join(" ")
        : `${id.slice("plugin:".length).replaceAll(":", " ")} ${argv.join(" ")}`.trim()
    const suggestion = rest ? `ecp plugins ${rest}` : "ecp plugins"
    const message = `The command is ${suggestion}, not ecp plugin.`
    if (json) {
      this.log(
        JSON.stringify(
          failureEnvelope({
            code: ECP_PLUGINS_MISSING,
            message,
            suggestions: [suggestion],
          })
        )
      )
    } else {
      this.log(message)
    }
    this.exit(EXIT_PLUGINS_MISSING)
  }

  const topic = firstToken(id)
  if (!topic) return
  // First-party plugins are unpublished until later phases. Map the unknown
  // topic to plugin-<topic> so `ecp jsonata` returns ECP_PLUGINS_MISSING
  // (exit 3) instead of oclif's not-found exit 127.
  const pkg = `@executioncontrolprotocol/plugin-${topic}`

  const installHint = `ecp plugins install ${topic}`
  const message = `Plugin ${pkg} is not installed.`
  if (json) {
    this.log(
      JSON.stringify(
        failureEnvelope({
          code: ECP_PLUGINS_MISSING,
          message,
          suggestions: [installHint],
        })
      )
    )
    this.exit(EXIT_PLUGINS_MISSING)
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const ok = await confirm(`Install ${pkg} and rerun?`, argv)
    if (ok) {
      await this.config.runCommand("plugins:install", [pkg])
      await this.config.runCommand(id, argv)
      return
    }
  }

  this.log(`${message} Run: ${installHint}`)
  this.exit(EXIT_PLUGINS_MISSING)
}

export default hook
