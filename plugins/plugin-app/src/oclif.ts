import { Args, Command, Flags } from "@oclif/core"
import { getHost } from "@executioncontrolprotocol/plugin-sdk"
import { DEFAULT_PLUGIN_APP_HOST, DEFAULT_PLUGIN_APP_PORT } from "./constants.js"
import { resolveAppOverlayPath } from "./environment-file.js"
import { serveApp } from "./serve-app.js"

/**
 * `ecp app` — live graph of a workflow file on the same host as `ecp run`.
 * @category App
 */
export class AppCommand extends Command {
  static id = "app"
  static summary = "Open a live graph of a workflow file"
  static description =
    "Serve the App on 127.0.0.1 with a pairing token in the URL. File edits update the graph; graph edits rewrite the file. Runs use the same host and journal as ecp run. --env is an optional environment overlay; omit it to use the process host or ~/.ecp/config/environment.ecp.ts. The App stores no secrets. Until 0.51.0 is on the registry, install with ecp plugins link plugins/plugin-app."
  static args = {
    file: Args.string({
      required: true,
      description: "Workflow file (*.ecp.ts)",
    }),
  }
  static flags = {
    host: Flags.string({
      description: "HTTP bind address (loopback only)",
      default: DEFAULT_PLUGIN_APP_HOST,
    }),
    port: Flags.integer({
      description: "HTTP bind port (0 = ephemeral)",
      default: DEFAULT_PLUGIN_APP_PORT,
    }),
    "no-open": Flags.boolean({
      description: "Do not open the default browser",
      default: false,
    }),
    env: Flags.string({
      description:
        "Optional environment overlay file; omit to use the process host or ~/.ecp/config/environment.ecp.ts",
    }),
  }

  async run(): Promise<void> {
    const parsed = await this.parse(AppCommand)
    const host = getHost(this.config)
    const overlayPath = resolveAppOverlayPath({
      envFlag: parsed.flags.env,
      configDir: this.config.configDir,
    })
    await serveApp({
      host,
      overlayPath,
      filePath: parsed.args.file,
      httpHost: parsed.flags.host,
      httpPort: parsed.flags.port,
      open: !parsed.flags["no-open"],
      block: true,
    })
  }
}

/**
 * oclif explicit command map for this plugin.
 * @category App
 */
export const COMMANDS = {
  app: AppCommand,
}
