import { Args, Command, Flags } from "@oclif/core"
import path from "node:path"
import { ensureWarmHost } from "../lib/host-discovery.js"
import { writeEnvelope } from "../lib/output.js"

/**
 * `ecp app` — open the App URL (UI lands in Phase 7).
 * @category CLI
 */
export default class App extends Command {
  static override description =
    "Open the visual App against the local host; use retrieve and execute for headless agent workflows."

  static override args = {
    path: Args.string({ description: "Execution file path to open in the App (resolved to absolute)." }),
  }

  static override examples = [
    {
      description: "Prints the App URL without opening a browser.",
      command: "<%= config.bin %> app --no-open",
    },
  ]

  static override flags = {
    id: Flags.string({ description: "Stored execution id to open instead of a file path." }),
    "no-open": Flags.boolean({
      description: "Print the URL only; do not launch the default browser.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(App)
    const warm = await ensureWarmHost()
    const params = new URLSearchParams()
    params.set("token", warm.token)
    if (flags.id) params.set("id", flags.id)
    else if (args.path) params.set("open", path.resolve(args.path))
    else params.set("dir", process.cwd())
    const url = `${warm.url}/app/#${params.toString()}`
    if (flags.json) {
      writeEnvelope({ ok: true, data: { url } }, { json: true, exitCode: 0 })
    }
    if (flags["no-open"]) this.log(url)
    else {
      const opened = await openUrl(url)
      if (!opened) this.log(url)
      else this.log(`opened ${url}`)
    }
    writeEnvelope({ ok: true, data: { url } }, { exitCode: 0 })
  }
}

async function openUrl(url: string): Promise<boolean> {
  try {
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const execFileAsync = promisify(execFile)
    if (process.platform === "win32") await execFileAsync("cmd", ["/c", "start", "", url])
    else if (process.platform === "darwin") await execFileAsync("open", [url])
    else await execFileAsync("xdg-open", [url])
    return true
  } catch {
    return false
  }
}