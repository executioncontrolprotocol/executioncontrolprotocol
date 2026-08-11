import type { IncomingMessage, ServerResponse } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { listOllamaModels } from "@executioncontrolprotocol/extension-ollama"
import { ECP_UP_VERSION, JSON_MIME } from "./constants.js"
import { readBearerToken, setCorsAndPna } from "./cors.js"
import { readRequestBody } from "./read-body.js"

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

interface InvokeBody {
  capability?: string
  input?: unknown
  provider?: string
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
      let body: InvokeBody
      try {
        const raw = await readRequestBody(req)
        body = raw.trim() ? (JSON.parse(raw) as InvokeBody) : {}
      } catch {
        writeJson(res, 400, { error: "Invalid JSON body" })
        return
      }
      if (typeof body.capability !== "string" || !body.capability.trim()) {
        writeJson(res, 400, { error: "capability is required" })
        return
      }
      try {
        const builder = ecp.invoke(body.capability).with(body.input ?? {})
        const result = await (body.provider ? builder.uses(body.provider) : builder).process()
        writeJson(res, 200, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        writeJson(res, 500, { error: message })
      }
      return
    }

    writeJson(res, 404, { error: "Not found" })
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": JSON_MIME })
  res.end(payload)
}
