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
    "idle-minutes": Flags.integer({
      description: "Stop the host after this many idle minutes (0 = never). Defaults to 15 or ECP_HOST_IDLE_MINUTES.",
      min: 0,
    }),
    "started-by": Flags.string({
      description: "Record how the supervisor was started (explicit for host start).",
      options: ["auto", "explicit"],
      default: "explicit",
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

    const idleMinutes = flags["idle-minutes"] ?? resolveIdleMinutesFromCliEnv()
    const startedBy = flags["started-by"] === "auto" ? "auto" : "explicit"

    if (flags.foreground) {
      await runSupervisor({
        home,
        idleMinutes,
        startedBy,
      })
      writeEnvelope({ ok: true, data: { foreground: true } }, { json: flags.json, exitCode: 0 })
    }

    try {
      await startSupervisorDetached(home, { startedBy, idleMinutes })
    } catch (error) {
      const message = error instanceof Error ? error.message : "host start failed"
      writeEnvelope(
        { ok: false, error: { code: "ECP_HOST_UNAVAILABLE", message } },
        {
          json: flags.json,
          human: () => this.error(message, { exit: 4 }),
          exitCode: 4,
        },
      )
    }
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
          const idleLabel = idleMinutes === 0 ? "never" : `${idleMinutes}m`
          this.log(`started ${payload.url} (idle ${idleLabel})`)
          this.log(`hostPid=${payload.hostPid} supervisorPid=${payload.supervisorPid}`)
          this.log(`logs ${payload.logs.host}`)
        },
        exitCode: 0,
      },
    )
  }
}

function resolveIdleMinutesFromCliEnv(): number {
  const raw = process.env.ECP_HOST_IDLE_MINUTES
  if (raw !== undefined && raw !== "") {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 15
}