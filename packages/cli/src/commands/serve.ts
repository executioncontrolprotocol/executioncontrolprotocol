import { Flags } from "@oclif/core"
import { DEFAULT_ECP_UP_HOST, DEFAULT_ECP_UP_PORT } from "../lib/up/constants.js"
import { startEcpServe } from "../lib/http/create-serve.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"

/** Serve an environment over loopback HTTP for capability invoke. */
export default class Serve extends EnvModuleCommand {
  static summary = "Serve an environment over HTTP"

  static description =
    "Run a loopback HTTP server that exposes POST /v1/invoke for any capability " +
    "bound in --env. No auth (loopback-only trust model). For the Ollama browser " +
    "demo bridge with pairing, use `ecp up`."

  static examples = [
    "<%= config.bin %> <%= command.id %> --env examples/01-echo/environment.ts",
    "<%= config.bin %> <%= command.id %> --env environment.ts --port 3090 --cors-origin http://localhost:5173",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    port: Flags.integer({
      description: "Listen port (ECP leet default 3090)",
      default: DEFAULT_ECP_UP_PORT,
    }),
    host: Flags.string({
      description: "Bind host (loopback only by default)",
      default: DEFAULT_ECP_UP_HOST,
    }),
    "cors-origin": Flags.string({
      description: "Extra allowed CORS origin (repeatable)",
      multiple: true,
      default: [],
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Serve)
    const ecp = await this.loadEcp(flags)
    const daemon = await startEcpServe({
      ecp,
      port: flags.port,
      host: flags.host,
      corsOrigins: flags["cors-origin"],
    })

    const baseURL = `http://${daemon.host}:${daemon.port}`
    this.log(`ECP serve on ${baseURL}`)
    this.log("GET /health · POST /v1/invoke (no auth; loopback)")
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
