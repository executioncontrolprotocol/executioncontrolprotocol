import { Args, Command, Flags } from "@oclif/core"
import path from "node:path"
import { ensureWarmHost } from "../lib/host-discovery.js"
import { exitWith } from "../lib/exit.js"

/**
 * `ecp app` — open the App URL (UI lands in Phase 7).
 * @category CLI
 */
export default class App extends Command {
  static override description = "Open the ECP App against the local host."

  static override args = {
    path: Args.string({ description: "Execution file to open." }),
  }

  static override flags = {
    id: Flags.string(),
    "no-open": Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
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
    if (flags.json) process.stdout.write(`${JSON.stringify({ url })}\n`)
    else if (flags["no-open"]) this.log(url)
    else {
      const opened = await openUrl(url)
      if (!opened) this.log(url)
      else this.log(`opened ${url}`)
    }
    exitWith(0)
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
