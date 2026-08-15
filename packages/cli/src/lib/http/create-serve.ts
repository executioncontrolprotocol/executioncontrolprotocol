import { createServer, type Server } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { DEFAULT_ECP_UP_HOST, DEFAULT_ECP_UP_PORT } from "../up/constants.js"
import { createServeRequestHandler } from "./create-serve-handler.js"

/** Options for {@link startEcpServe}. @category CLI */
export interface StartEcpServeOptions {
  /** Initialized operational ECP instance. */
  ecp: Ecp
  /** Listen port (default 3090). */
  port?: number
  /** Bind host (default 127.0.0.1). */
  host?: string
  /** Extra CORS origins. */
  corsOrigins?: string[]
}

/** Result of starting `ecp serve`. @category CLI */
export interface EcpServeServer {
  /** Listening HTTP server. */
  server: Server
  /** Resolved listen port. */
  port: number
  /** Resolved bind host. */
  host: string
  /** Close the HTTP server (does not terminate ECP). */
  close: () => Promise<void>
}

/**
 * Start a loopback HTTP server that exposes `POST /v1/invoke` for an environment.
 * @category CLI
 */
export async function startEcpServe(options: StartEcpServeOptions): Promise<EcpServeServer> {
  const port = options.port ?? DEFAULT_ECP_UP_PORT
  const host = options.host ?? DEFAULT_ECP_UP_HOST
  const allowOrigins = new Set<string>(options.corsOrigins ?? [])

  const handler = createServeRequestHandler({
    ecp: options.ecp,
    allowOrigins,
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
    port,
    host,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}
