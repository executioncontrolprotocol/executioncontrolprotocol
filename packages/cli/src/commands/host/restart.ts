import { Command, Flags } from "@oclif/core"
import { readHostJson } from "@executioncontrolprotocol/host"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp host restart`
 * @category CLI
 */
export default class HostRestart extends Command {
  static override description = "Restart the local host via the supervisor."

  static override flags = {
    force: Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostRestart)
    const file = readHostJson(ecpHome())
    if (!file) this.error("Host is not running.", { exit: 4 })
    await new ControlClient(file).restart(flags.force)
    if (flags.json) process.stdout.write(`${JSON.stringify({ restarted: true })}\n`)
    else this.log("restart requested")
    exitWith(0)
  }
}
