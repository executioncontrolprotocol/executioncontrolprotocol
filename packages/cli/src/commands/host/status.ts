import { Command, Flags } from "@oclif/core"
import { checkHealth, readHostJson } from "@executioncontrolprotocol/host"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp host status`
 * @category CLI
 */
export default class HostStatus extends Command {
  static override description = "Show supervisor and host health."

  static override flags = {
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStatus)
    const home = ecpHome()
    const file = readHostJson(home)
    if (!file) {
      if (flags.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code: "ECP_HOST_UNAVAILABLE", message: "Host is not running." } })}\n`,
        )
      } else this.error("Host is not running.", { exit: 4 })
      exitWith(4)
    }
    let supervisor
    try {
      supervisor = await new ControlClient(file).status()
    } catch {
      supervisor = null
    }
    const health = await checkHealth(`http://127.0.0.1:${file.port}`)
    if (!health && !supervisor) {
      if (flags.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code: "ECP_HOST_UNAVAILABLE", message: "Host is not running." } })}\n`,
        )
      } else this.error("Host is not running.", { exit: 4 })
      exitWith(4)
    }
    const payload = { supervisor, health, port: file.port, home: file.home }
    if (flags.json) process.stdout.write(`${JSON.stringify(payload)}\n`)
    else {
      this.log(`port=${file.port} health=${health?.status ?? "unknown"}`)
      if (supervisor) this.log(`supervisor hostStatus=${supervisor.hostStatus} restarts=${supervisor.restarts}`)
    }
    exitWith(0)
  }
}
