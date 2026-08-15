import type { IncomingMessage, ServerResponse } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { listOllamaModels } from "@executioncontrolprotocol/extension-ollama"
import { handleInvokePost } from "../http/handle-invoke.js"
import { writeJson } from "../http/write-json.js"
import { ECP_UP_VERSION } from "./constants.js"
import { readBearerToken, setCorsAndPna } from "./cors.js"

/** Dependencies for {@link createUpRequestHandler}. @category CLI */
export interface UpRequestHandlerOptions {
  /** Operational ECP instance. */
  ecp: Ecp
  /** Allowlisted CORS origins. */
  allowOrigins: ReadonlySet<string>
  /** Pairing token for `/v1/*`. */
  token: string
  /** Ollama base URL used for `/health` reachability. */
  ollamaUrl: string
}

/**
 * Create the HTTP request handler for `ecp up`.
 * @category CLI
 */
export function createUpRequestHandler(options: UpRequestHandlerOptions) {
  const { ecp, allowOrigins, token, ollamaUrl } = options

  return async function handleUpRequest(
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
      let ollamaReachable = false
      try {
        await listOllamaModels(ollamaUrl, { signal: AbortSignal.timeout(2000) })
        ollamaReachable = true
      } catch {
        ollamaReachable = false
      }
      writeJson(res, 200, {
        ok: true,
        version: ECP_UP_VERSION,
        ollamaReachable,
      })
      return
    }

    if (req.method === "POST" && pathname === "/v1/invoke") {
      const presented = readBearerToken(req)
      if (!presented || presented !== token) {
        writeJson(res, 401, { error: "Unauthorized" })
        return
      }
      await handleInvokePost(ecp, req, res)
      return
    }

    writeJson(res, 404, { error: "Not found" })
  }
}
