import { Command, Flags } from "@oclif/core"
import { checkHealth, readHostJson } from "@executioncontrolprotocol/host"
import { ControlClient } from "../../lib/control-client.js"
import { ecpHome } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp host status`
 * @category CLI
 */
export default class HostStatus extends Command {
  static override description =
    "Report whether the background host is up; use host start when retrieve or execute is slow without --start-host."

  static override examples = [
    {
      description: "Prints supervisor and API health; add --json for the envelope.",
      command: "<%= config.bin %> host status",
    },
  ]

  static override flags = {
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStatus)
    const home = ecpHome()
    const unavailable = {
      ok: false as const,
      error: { code: "ECP_HOST_UNAVAILABLE", message: "Host is not running." },
    }
    const file = readHostJson(home)
    if (!file) {
      writeEnvelope(unavailable, {
        json: flags.json,
        human: () => this.error("Host is not running.", { exit: 4 }),
        exitCode: 4,
      })
    }
    let supervisor
    try {
      supervisor = await new ControlClient(file).status()
    } catch {
      supervisor = null
    }
    const health = await checkHealth(`http://127.0.0.1:${file.port}`)
    if (!health && !supervisor) {
      writeEnvelope(unavailable, {
        json: flags.json,
        human: () => this.error("Host is not running.", { exit: 4 }),
        exitCode: 4,
      })
    }
    const payload = { supervisor, health, port: file.port, home: file.home }
    writeEnvelope(
      { ok: true, data: payload },
      {
        json: flags.json,
        human: () => {
          this.log(`port=${file.port} health=${health?.status ?? "unknown"}`)
          if (supervisor) this.log(`supervisor hostStatus=${supervisor.hostStatus} restarts=${supervisor.restarts}`)
        },
        exitCode: 0,
      },
    )
  }
}