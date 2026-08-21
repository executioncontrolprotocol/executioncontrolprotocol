import type { IncomingMessage, ServerResponse } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { handleArtifactGet } from "./handle-artifact.js"
import { handleInvokePost } from "./handle-invoke.js"
import { writeJson } from "./write-json.js"
import { ECP_UP_VERSION } from "../up/constants.js"
import { setCorsAndPna } from "../up/cors.js"

/** Dependencies for {@link createServeRequestHandler}. @category CLI */
export interface ServeRequestHandlerOptions {
  /** Operational ECP instance. */
  ecp: Ecp
  /** Allowlisted CORS origins (empty = no CORS reflection). */
  allowOrigins: ReadonlySet<string>
}

/**
 * Create the HTTP request handler for `ecp serve` (no auth).
 * @category CLI
 */
export function createServeRequestHandler(options: ServeRequestHandlerOptions) {
  const { ecp, allowOrigins } = options

  return async function handleServeRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    setCorsAndPna(req, res, allowOrigins)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`)
    const pathname = url.pathname

    if (req.method === "GET" && pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        version: ECP_UP_VERSION,
      })
      return
    }

    if (req.method === "GET" && pathname === "/v1/artifacts") {
      await handleArtifactGet(ecp, req, res)
      return
    }

    if (req.method === "POST" && pathname === "/v1/invoke") {
      await handleInvokePost(ecp, req, res)
      return
    }

    writeJson(res, 404, { error: "Not found" })
  }
}
