import { Command, Flags } from "@oclif/core"
import { readHostJson, runSupervisor } from "@executioncontrolprotocol/host"
import { startSupervisorDetached } from "../../lib/host-discovery.js"
import { ecpHome } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp host start`
 * @category CLI
 */
export default class HostStart extends Command {
  static override description =
    "Start the detached supervisor and host; use --foreground to run attached for debugging."

  static override examples = [
    {
      description: "Starts the local host and prints URL and log paths; add --json for the envelope.",
      command: "<%= config.bin %> host start",
    },
  ]

  static override flags = {
    foreground: Flags.boolean({
      description: "Run supervisor and host in the foreground (blocks until exit). Default: detached.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStart)
    const home = ecpHome()

    if (flags.foreground) {
      await runSupervisor({ home })
      writeEnvelope({ ok: true, data: { foreground: true } }, { json: flags.json, exitCode: 0 })
    }

    await startSupervisorDetached(home)
    const file = readHostJson(home)
    if (!file) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_HOST_UNAVAILABLE", message: "host.json was not written." } },
        {
          json: flags.json,
          human: () => this.error("host.json was not written", { exit: 4 }),
          exitCode: 4,
        },
      )
    }
    const payload = {
      url: `http://127.0.0.1:${file.port}`,
      hostPid: file.hostPid,
      supervisorPid: file.supervisorPid,
      logs: {
        host: `${home}/logs/host.log`,
        supervisor: `${home}/logs/supervisor.log`,
      },
    }
    writeEnvelope(
      { ok: true, data: payload },
      {
        json: flags.json,
        human: () => {
          this.log(`started ${payload.url}`)
          this.log(`hostPid=${payload.hostPid} supervisorPid=${payload.supervisorPid}`)
          this.log(`logs ${payload.logs.host}`)
        },
        exitCode: 0,
      },
    )
  }
}