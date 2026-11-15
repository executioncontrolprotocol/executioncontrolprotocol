import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Command, Flags } from "@oclif/core"
import { ecpHome } from "../../lib/home.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp host logs`
 * @category CLI
 */
export default class HostLogs extends Command {
  static override description = "Tail host or supervisor logs."

  static override flags = {
    lines: Flags.integer({ default: 50 }),
    supervisor: Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostLogs)
    const home = ecpHome()
    const file = path.join(home, "logs", flags.supervisor ? "supervisor.log" : "host.log")
    if (!existsSync(file)) {
      this.error(`Log file not found: ${file}`, { exit: 2 })
    }
    const text = readFileSync(file, "utf8")
    const lines = text.split(/\r?\n/)
    const tail = lines.slice(Math.max(0, lines.length - (flags.lines || 50))).join("\n")
    if (flags.json) process.stdout.write(`${JSON.stringify({ path: file, text: tail })}\n`)
    else process.stdout.write(tail.endsWith("\n") ? tail : `${tail}\n`)
    exitWith(0)
  }
}
