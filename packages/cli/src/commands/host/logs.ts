import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Command, Flags } from "@oclif/core"
import { ecpHome } from "../../lib/home.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp host logs`
 * @category CLI
 */
export default class HostLogs extends Command {
  static override description =
    "Show recent host or supervisor log lines; use host status when the file is missing."

  static override examples = [
    {
      description: "Prints the last 50 host log lines; add --json for { path, text } in data.",
      command: "<%= config.bin %> host logs --lines 50",
    },
  ]

  static override flags = {
    lines: Flags.integer({
      description: "Number of lines to print from the end of the log file.",
      default: 50,
    }),
    supervisor: Flags.boolean({
      description: "Read supervisor.log instead of host.log.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(HostLogs)
    const home = ecpHome()
    const file = path.join(home, "logs", flags.supervisor ? "supervisor.log" : "host.log")
    if (!existsSync(file)) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_NOT_FOUND", message: `Log file not found: ${file}` } },
        {
          json: flags.json,
          human: () => this.error(`Log file not found: ${file}`, { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    const text = readFileSync(file, "utf8")
    const lines = text.split(/\r?\n/)
    const tail = lines.slice(Math.max(0, lines.length - (flags.lines || 50))).join("\n")
    writeEnvelope(
      { ok: true, data: { path: file, text: tail } },
      {
        json: flags.json,
        human: () => process.stdout.write(tail.endsWith("\n") ? tail : `${tail}\n`),
        exitCode: 0,
      },
    )
  }
}