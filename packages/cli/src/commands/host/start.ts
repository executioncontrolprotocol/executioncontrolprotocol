import { Command, Flags } from "@oclif/core"
import { checkHealth, readHostJson, runSupervisor } from "@executioncontrolprotocol/host"
import { startSupervisorDetached } from "../../lib/host-discovery.js"
import { ecpHome } from "../../lib/home.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp host start`
 * @category CLI
 */
export default class HostStart extends Command {
  static override description = "Start the local host supervisor."

  static override flags = {
    foreground: Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostStart)
    const home = ecpHome()
    const existing = readHostJson(home)
    if (existing) {
      const health = await checkHealth(`http://127.0.0.1:${existing.port}`)
      if (health?.status === "ok" || health?.status === "draining") {
        const payload = {
          url: `http://127.0.0.1:${existing.port}`,
          hostPid: existing.hostPid,
          supervisorPid: existing.supervisorPid,
          logs: {
            host: `${home}/logs/host.log`,
            supervisor: `${home}/logs/supervisor.log`,
          },
        }
        if (flags.json) process.stdout.write(`${JSON.stringify(payload)}\n`)
        else {
          this.log(`already running ${payload.url}`)
          this.log(`hostPid=${payload.hostPid} supervisorPid=${payload.supervisorPid}`)
        }
        exitWith(0)
      }
    }

    if (flags.foreground) {
      // Blocks until supervisor exits.
      await runSupervisor({ home })
      exitWith(0)
    }

    await startSupervisorDetached(home)
    const file = readHostJson(home)
    if (!file) this.error("host.json was not written", { exit: 4 })
    const payload = {
      url: `http://127.0.0.1:${file.port}`,
      hostPid: file.hostPid,
      supervisorPid: file.supervisorPid,
      logs: {
        host: `${home}/logs/host.log`,
        supervisor: `${home}/logs/supervisor.log`,
      },
    }
    if (flags.json) process.stdout.write(`${JSON.stringify(payload)}\n`)
    else {
      this.log(`started ${payload.url}`)
      this.log(`hostPid=${payload.hostPid} supervisorPid=${payload.supervisorPid}`)
      this.log(`logs ${payload.logs.host}`)
    }
    exitWith(0)
  }
}
