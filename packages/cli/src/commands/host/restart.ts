import { Command, Flags } from "@oclif/core"
import { readHostJson } from "@executioncontrolprotocol/host/client"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp host restart`
 * @category CLI
 */
export default class HostRestart extends Command {
  static override description =
    "Ask the supervisor to restart the host process; use host status when the API stays unhealthy."

  static override examples = [
    {
      description: "Requests a host restart; add --json for the envelope.",
      command: "<%= config.bin %> host restart",
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: "Restart without waiting for runs to drain.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostRestart)
    const file = readHostJson(ecpHome())
    if (!file) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_HOST_UNAVAILABLE", message: "Host is not running." } },
        {
          json: flags.json,
          human: () => this.error("Host is not running.", { exit: 4 }),
          exitCode: 4,
        },
      )
    }
    await new ControlClient(file).restart(flags.force)
    writeEnvelope(
      { ok: true, data: { restarted: true } },
      { json: flags.json, human: () => this.log("restart requested"), exitCode: 0 },
    )
  }
}