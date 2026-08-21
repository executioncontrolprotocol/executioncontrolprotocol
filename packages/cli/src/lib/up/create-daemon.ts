import { createServer, type Server } from "node:http"
import { environment, extension } from "@executioncontrolprotocol/node"
import type { Ecp } from "@executioncontrolprotocol/core"
import { loadEnvironmentModule } from "@executioncontrolprotocol/core/loaders"
import "@executioncontrolprotocol/extension-ollama"
import { registerOllamaExtension } from "@executioncontrolprotocol/extension-ollama"
import {
  DEFAULT_CORS_ORIGINS,
  DEFAULT_ECP_UP_HOST,
  DEFAULT_ECP_UP_PORT,
  DEFAULT_OLLAMA_URL,
} from "./constants.js"
import { createUpRequestHandler } from "./handle-request.js"

/** Options for {@link startEcpUpDaemon}. @category CLI */
export interface StartEcpUpDaemonOptions {
  /** Listen port (default 3090). */
  port?: number
  /** Bind host (default 127.0.0.1). */
  host?: string
  /** Ollama API base URL. */
  ollamaUrl?: string
  /** Extra CORS origins (merged with Vite defaults). */
  corsOrigins?: string[]
  /** Pairing token for `/v1/invoke`. */
  token: string
  /** Optional environment module path (`ecp up --env`). */
  envPath?: string
}

/** Result of starting the daemon. @category CLI */
export interface EcpUpDaemon {
  /** Listening HTTP server. */
  server: Server
  /** Operational ECP instance. */
  ecp: Ecp
  /** Resolved listen port. */
  port: number
  /** Resolved bind host. */
  host: string
  /** Pairing token. */
  token: string
  /** Close the server and terminate ECP. */
  close: () => Promise<void>
}

/**
 * Load the operational ECP instance for `ecp up`.
 * Always hosts Ollama (browser demo model picker / coding harness).
 * With `--env`, that project's Node environment is loaded and Ollama is added
 * so host packages (e.g. image-sharp) and Ollama coexist.
 * Without `--env`, the daemon hosts Ollama only.
 * @category CLI
 */
export async function loadUpDaemonEcp(options: {
  /** Optional environment module path. */
  envPath?: string
  /** Ollama API base URL for the default daemon env. */
  ollamaUrl: string
}): Promise<Ecp> {
  await registerOllamaExtension()
  const ollamaConfig = { baseURL: options.ollamaUrl }
  if (options.envPath) {
    const loaded = await loadEnvironmentModule(options.envPath)
    // Project envs use their own registry instance after module load — register Ollama there.
    await registerOllamaExtension(loaded.getRegistry())
    // Project envs (e.g. image-prep) omit Ollama; the demo bridge still needs listModels/generate.
    loaded.addExtensionBinding("@executioncontrolprotocol/ollama", ollamaConfig)
    return loaded.init()
  }
  const env = (await environment("ecp-up")).withExtensions([
    extension("@executioncontrolprotocol/ollama").with(ollamaConfig),
  ])
  return env.init()
}

/**
 * Start the local ECP daemon (`ecp up`).
 * @category CLI
 */
export async function startEcpUpDaemon(
  options: StartEcpUpDaemonOptions
): Promise<EcpUpDaemon> {
  const port = options.port ?? DEFAULT_ECP_UP_PORT
  const host = options.host ?? DEFAULT_ECP_UP_HOST
  const ollamaUrl = options.ollamaUrl ?? DEFAULT_OLLAMA_URL
  const token = options.token

  const ecp = await loadUpDaemonEcp({
    envPath: options.envPath,
    ollamaUrl,
  })

  const allowOrigins = new Set<string>([
    ...DEFAULT_CORS_ORIGINS,
    ...(options.corsOrigins ?? []),
  ])

  const handler = createUpRequestHandler({
    ecp,
    allowOrigins,
    token,
    ollamaUrl,
  })

  const server = createServer((req, res) => {
    void handler(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
      }
      res.end(JSON.stringify({ error: message }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => {
      server.off("error", reject)
      resolve()
    })
  })

  return {
    server,
    ecp,
    port,
    host,
    token,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
      await ecp.terminate()
    },
  }
}
