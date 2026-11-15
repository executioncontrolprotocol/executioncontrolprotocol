import { createServer, type Server } from "node:http"
import { randomBytes, timingSafeEqual } from "node:crypto"
import type { AddressInfo } from "node:net"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_PATH,
  DEFAULT_MCP_PORT,
  MCP_BEARER_PREFIX,
} from "./constants.js"
import { assertHttpBind } from "./http-bind.js"
import { createEcpMcpServer } from "./server.js"
import type { CreateEcpMcpServerOptions } from "./types.js"

/**
 * Options for {@link serveHttp}.
 * @category MCP
 */
export interface ServeHttpOptions extends CreateEcpMcpServerOptions {
  /** Bind address. Defaults to `127.0.0.1`. */
  httpHost?: string
  /** Bind port. Defaults to `3847`. `0` asks the OS for an ephemeral port. */
  httpPort?: number
  /** Required to bind beyond loopback. */
  allowRemote?: boolean
  /** Bearer token. Generated when omitted. */
  token?: string
  /**
   * Print the listen URL and bearer token once to stderr.
   * Tests set this to false so the token is never logged.
   */
  printToken?: boolean
  /** MCP endpoint path. Defaults to `/mcp`. */
  path?: string
  /**
   * When true, the returned promise settles only after the HTTP server closes.
   * The CLI sets this so `ecp mcp serve --http` stays running.
   */
  block?: boolean
}

/**
 * Handle for a listening HTTP MCP server.
 * @category MCP
 */
export interface HttpServeHandle {
  /** Bind address actually listening. */
  host: string
  /** Bind port actually listening. */
  port: number
  /** MCP endpoint path. */
  path: string
  /** Bearer token required on every request. */
  token: string
  /** Underlying Node HTTP server. */
  httpServer: Server
  /** MCP server. */
  mcp: McpServer
  /** Stop watching, close MCP, close HTTP. */
  close: () => Promise<void>
}

/**
 * Generate a random bearer token. Not logged.
 * @category MCP
 */
export function generateBearerToken(): string {
  return randomBytes(32).toString("hex")
}

function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith(MCP_BEARER_PREFIX)) return false
  const given = Buffer.from(header.slice(MCP_BEARER_PREFIX.length))
  const expected = Buffer.from(token)
  if (given.length !== expected.length) return false
  return timingSafeEqual(given, expected)
}

/**
 * Serve MCP over streamable HTTP on loopback with a bearer token.
 * @category MCP
 */
export async function serveHttp(options: ServeHttpOptions): Promise<HttpServeHandle> {
  const host = options.httpHost ?? DEFAULT_MCP_HOST
  assertHttpBind(host, Boolean(options.allowRemote))
  const token = options.token ?? generateBearerToken()
  const path = options.path ?? DEFAULT_MCP_PATH
  const requestedPort = options.httpPort ?? DEFAULT_MCP_PORT

  const mcp = createEcpMcpServer(options)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await mcp.connect(transport)

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`)
    if (url.pathname !== path) {
      res.writeHead(404).end()
      return
    }
    if (!bearerMatches(req.headers.authorization, token)) {
      res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end("Unauthorized")
      return
    }
    void transport.handleRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(requestedPort, host, () => resolve())
  })

  const address = httpServer.address() as AddressInfo
  const handle: HttpServeHandle = {
    host: address.address,
    port: address.port,
    path,
    token,
    httpServer,
    mcp,
    close: async () => {
      await transport.close()
      await mcp.close()
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }

  if (options.printToken !== false) {
    const shownHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
    process.stderr.write(`MCP HTTP listening on http://${shownHost}:${handle.port}${path}\n`)
    process.stderr.write(`Authorization: Bearer ${token}\n`)
  }

  if (options.block) {
    await new Promise<void>((resolve) => {
      const stop = (): void => {
        void handle.close().finally(resolve)
      }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      httpServer.once("close", resolve)
    })
  }

  return handle
}
