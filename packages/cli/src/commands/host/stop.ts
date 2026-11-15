import { Command, Flags } from "@oclif/core"
import { readHostJson } from "@executioncontrolprotocol/host"
import { setTimeout as delay } from "node:timers/promises"
import { existsSync, unlinkSync } from "node:fs"
import path from "node:path"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp host stop`
 * @category CLI
 */
export default class HostStop extends Command {
  static override description = "Stop the local host supervisor."

  static override flags = {
    force: Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStop)
    const home = ecpHome()
    const file = readHostJson(home)
    if (!file) {
      if (flags.json) process.stdout.write(`${JSON.stringify({ stopped: true })}\n`)
      else this.log("host is not running")
      exitWith(0)
    }
    const client = new ControlClient(file)
    try {
      await client.stop(flags.force)
    } catch {
      // Supervisor may exit before responding.
    }
    const hostJson = path.join(home, "host.json")
    for (let i = 0; i < 50; i++) {
      if (!existsSync(hostJson)) break
      await delay(100)
    }
    if (existsSync(hostJson)) {
      try {
        unlinkSync(hostJson)
      } catch {
        // ignore
      }
    }
    if (flags.json) process.stdout.write(`${JSON.stringify({ stopped: true })}\n`)
    else this.log("stopped")
    exitWith(0)
  }
}
