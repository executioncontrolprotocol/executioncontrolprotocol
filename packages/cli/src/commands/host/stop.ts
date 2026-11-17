import { Command, Flags } from "@oclif/core"
import { readHostJson } from "@executioncontrolprotocol/host"
import { setTimeout as delay } from "node:timers/promises"
import { existsSync, unlinkSync } from "node:fs"
import path from "node:path"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp host stop`
 * @category CLI
 */
export default class HostStop extends Command {
  static override description = "Stop the supervisor and host; use host status to confirm it is down."

  static override examples = [
    {
      description: "Stops a running host; add --json for { ok, data: { stopped: true } }.",
      command: "<%= config.bin %> host stop",
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: "Force-stop immediately instead of draining runs first.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStop)
    const home = ecpHome()
    const file = readHostJson(home)
    if (!file) {
      writeEnvelope(
        { ok: true, data: { stopped: true } },
        { json: flags.json, human: () => this.log("host is not running"), exitCode: 0 },
      )
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
    writeEnvelope(
      { ok: true, data: { stopped: true } },
      { json: flags.json, human: () => this.log("stopped"), exitCode: 0 },
    )
  }
}