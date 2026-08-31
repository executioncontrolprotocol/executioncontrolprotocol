import { randomUUID } from "node:crypto"
import { Command, Flags } from "@oclif/core"
import {
  DEFAULT_DEMO_OPEN_URL,
  DEFAULT_ECP_UP_HOST,
  DEFAULT_ECP_UP_PORT,
  DEFAULT_OLLAMA_URL,
} from "../lib/up/constants.js"
import { startEcpUpDaemon } from "../lib/up/create-daemon.js"
import { buildDemoOpenUrl, openBrowserUrl, originFromUrl } from "../lib/up/open-browser.js"

/** Start the local ECP daemon (bridges Ollama for the browser demo). */
export default class Up extends Command {
  static summary = "Start the local ECP daemon"

  static description =
    "Run a loopback HTTP daemon that exposes ECP invoke for a local environment " +
    "(CORS + Private Network Access). Always hosts Ollama for the browser demo; " +
    "optional --env adds that project's host extensions alongside Ollama. " +
    "Opens the browser demo with ?token= for pairing."

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --env environment.ts",
    "<%= config.bin %> <%= command.id %> --open-url http://localhost:5173/",
    "<%= config.bin %> <%= command.id %> --no-open",
  ]

  static flags = {
    port: Flags.integer({
      description: "Listen port (ECP leet default 3090)",
      default: DEFAULT_ECP_UP_PORT,
    }),
    host: Flags.string({
      description: "Bind host (loopback only by default)",
      default: DEFAULT_ECP_UP_HOST,
    }),
    "ollama-url": Flags.string({
      description: "Ollama HTTP API base URL",
      default: DEFAULT_OLLAMA_URL,
    }),
    "cors-origin": Flags.string({
      description: "Extra allowed CORS origin (repeatable)",
      multiple: true,
      default: [],
    }),
    env: Flags.string({
      description:
        "Path to environment module (.ts or .js). Merged with Ollama (always hosted for the demo bridge).",
    }),
    token: Flags.string({
      description: "Pairing token for /v1/invoke (auto-generated if omitted)",
    }),
    "open-url": Flags.string({
      description: "Browser demo URL to open with ?token= (pairing)",
      default: DEFAULT_DEMO_OPEN_URL,
    }),
    open: Flags.boolean({
      description: "Open the browser demo after the daemon starts",
      allowNo: true,
      default: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Up)
    const token = flags.token ?? randomUUID()
    const openUrl = flags["open-url"]
    const openOrigin = originFromUrl(openUrl)
    const corsOrigins = [
      ...flags["cors-origin"],
      ...(openOrigin ? [openOrigin] : []),
    ]

    const daemon = await startEcpUpDaemon({
      port: flags.port,
      host: flags.host,
      ollamaUrl: flags["ollama-url"],
      corsOrigins,
      token,
      envPath: flags.env,
    })

    const bridgeBaseURL = `http://${daemon.host}:${daemon.port}`
    const demoUrl = buildDemoOpenUrl(openUrl, {
      token: daemon.token,
      bridgeBaseURL,
    })

    this.log(`ECP daemon on ${bridgeBaseURL}`)
    this.log(`Pairing token: ${daemon.token}`)
    this.log("GET /health (no auth) · POST /v1/invoke · GET /v1/artifacts (Bearer or ?token=)")

    if (flags.open) {
      this.log(`Opening ${demoUrl}`)
      try {
        openBrowserUrl(demoUrl)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.warn(`Could not open browser: ${message}`)
        this.log(`Open manually: ${demoUrl}`)
      }
    } else {
      this.log(`Demo URL: ${demoUrl}`)
    }

    this.log("Press Ctrl+C to stop.")

    await new Promise<void>((resolve) => {
      const shutdown = () => {
        void daemon.close().finally(() => resolve())
      }
      process.once("SIGINT", shutdown)
      process.once("SIGTERM", shutdown)
    })
  }
}
