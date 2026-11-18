import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import type { Operations, ServiceContext } from "@executioncontrolprotocol/engine"
import {
  Auth,
  IMPLEMENTATION_IDS,
  PluginAdapter,
  StorageProvider,
  type Auth as AuthService,
  type CommitInput,
  type Endpoint,
  type ExecuteInput,
  type OperationResponse,
  type PluginAdapter as PluginAdapterService,
  type RetrieveInput,
  type RunRecord,
  type StorageChange,
  type StorageProvider as StorageProviderService,
} from "@executioncontrolprotocol/protocol"
import { HostActivityTracker } from "../activity-tracker.js"
import { VERSION } from "../version.js"
import { refuse, statusForEnvelope } from "./envelope.js"
import { listExecutionFiles, readAllowedFile } from "./files.js"
import { watchExecutionPath } from "./path-watch.js"
import { resolveAppRoot } from "./resolve-app-root.js"
import { serveAppStatic } from "./static-app.js"

const BODY_MAX_BYTES = 10 * 1024 * 1024
const HEARTBEAT_MS = 15_000
const DRAIN_RETRY_AFTER_MS = 1000

/**
 * Options for {@link HttpApiEndpoint}.
 * @category Host
 */
export interface HttpApiEndpointOptions {
  /** Preferred listen port; `0` picks an ephemeral port. */
  port?: number
  /** Shared host token (also configured on Auth). */
  token: string
  /** When true, `/v1/admin/shutdown` calls `process.exit(0)`. Default false. */
  exitOnShutdown?: boolean
  /** Absolute path to the App `dist/web` bundle. Resolved automatically when omitted. */
  appRoot?: string
}

type HealthStatus = "starting" | "ok" | "draining"

/**
 * Localhost HTTP API for retrieve/execute/commit, watch, file and admin routes.
 * @category Host
 */
export class HttpApiEndpoint implements Endpoint {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.httpEndpoint

  private readonly ctx: ServiceContext
  private readonly preferredPort: number
  private readonly exitOnShutdown: boolean
  private readonly appRoot: string | undefined
  private server: Server | undefined
  private operations: Operations | undefined
  private draining = false
  private startedAt = new Date().toISOString()
  private health: HealthStatus = "starting"
  private shutdownResolvers: Array<() => void> = []
  private editorSchemaGate: (() => Promise<unknown>) | undefined
  private readonly activity = new HostActivityTracker()
  /** Bound URL once listening. */
  url: string | undefined
  /** Resolved listen port. */
  port = 0

  /**
   * @param ctx Service context; `options` is {@link HttpApiEndpointOptions}.
   */
  constructor(ctx: ServiceContext) {
    this.ctx = ctx
    const opts = (ctx.options ?? {}) as Partial<HttpApiEndpointOptions>
    if (!opts.token) throw new Error("HttpApiEndpoint requires options.token.")
    this.preferredPort = opts.port ?? 0
    this.exitOnShutdown = opts.exitOnShutdown === true
    this.appRoot = resolveAppRoot(opts.appRoot)
  }

  /** Attach the host operations facade after the environment is ready. */
  bindOperations(operations: Operations): void {
    this.operations = operations
  }

  /** Mark ready for traffic after bind. */
  markReady(): void {
    this.health = this.draining ? "draining" : "ok"
    if (!this.draining) this.activity.touch()
  }

  /**
   * When set, `retrieve` with `type: "plugin"` or `type: "schema"` awaits this before responding.
   * @category Host
   */
  setEditorSchemaGate(waitFor: () => Promise<unknown>): void {
    this.editorSchemaGate = waitFor
  }

  /** Resolves when admin shutdown finishes (and optionally after process.exit is skipped). */
  whenShutdown(): Promise<void> {
    return new Promise((resolve) => this.shutdownResolvers.push(resolve))
  }

  /** Listen on 127.0.0.1. */
  async start(): Promise<void> {
    this.startedAt = new Date().toISOString()
    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(this.preferredPort, "127.0.0.1", () => {
        const address = this.server!.address()
        if (address && typeof address === "object") {
          this.port = address.port
          this.url = `http://127.0.0.1:${this.port}`
        }
        resolve()
      })
    })
    this.ctx.logger.info("http listening", { url: this.url })
  }

  /** Close the server. */
  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  private ops(): Operations {
    if (!this.operations) throw new Error("HttpApiEndpoint.bindOperations was not called.")
    return this.operations
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID()
    res.setHeader("X-Ecp-Request-Id", requestId)
    const method = req.method ?? "GET"
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port || 80}`)
    const pathName = url.pathname
    this.ctx.logger.info("http", { requestId, method, path: pathName })

    try {
      if (method === "GET" && pathName === "/") {
        res.statusCode = 302
        res.setHeader("Location", "/app/")
        res.end()
        return
      }
      if (method === "GET" && (pathName === "/app" || pathName.startsWith("/app/"))) {
        if (this.appRoot && serveAppStatic(this.appRoot, pathName, res)) return
        this.writeJson(
          res,
          404,
          refuse("ECP_NOT_FOUND", "App static bundle is missing. Run pnpm run build first."),
        )
        return
      }
      if (method === "GET" && pathName === "/v1/health") {
        await this.writeHealth(res)
        return
      }

      if (
        (method === "POST" &&
          (pathName === "/v1/retrieve" || pathName === "/v1/execute" || pathName === "/v1/commit")) ||
        (method === "GET" && (pathName === "/v1/file" || pathName === "/v1/files"))
      ) {
        this.activity.touch()
      }

      const headers = flattenHeaders(req.headers)
      if (!(await this.authorize(headers))) {
        this.writeJson(res, 401, refuse("ECP_UNAUTHORIZED", "Bearer token, Host, or Origin was rejected."))
        return
      }

      if (method === "POST" && pathName === "/v1/retrieve") {
        const body = await readJsonBody(req)
        if (!body.ok) {
          this.writeJson(res, body.status, body.envelope)
          return
        }
        const input = body.value as RetrieveInput
        if ((input.type === "plugin" || input.type === "schema") && this.editorSchemaGate) {
          await this.editorSchemaGate()
        }
        const envelope = await this.ops().retrieve(input)
        this.writeJson(res, statusForEnvelope(envelope), envelope)
        return
      }
      if (method === "POST" && pathName === "/v1/execute") {
        const body = await readJsonBody(req)
        if (!body.ok) {
          this.writeJson(res, body.status, body.envelope)
          return
        }
        const input = body.value as ExecuteInput
        if (this.draining && isRunExecute(input)) {
          this.writeJson(
            res,
            503,
            refuse("ECP_HOST_RESTARTING", "The host is draining and not accepting new runs.", {
              retryAfterMs: DRAIN_RETRY_AFTER_MS,
            }),
          )
          return
        }
        const envelope = await this.ops().execute(input)
        this.writeJson(res, statusForEnvelope(envelope), envelope)
        return
      }
      if (method === "POST" && pathName === "/v1/commit") {
        const body = await readJsonBody(req)
        if (!body.ok) {
          this.writeJson(res, body.status, body.envelope)
          return
        }
        const envelope = await this.ops().commit(body.value as CommitInput)
        this.writeJson(res, statusForEnvelope(envelope), envelope)
        return
      }
      if (method === "GET" && pathName === "/v1/watch") {
        await this.handleWatch(req, res, url)
        return
      }
      if (method === "GET" && pathName === "/v1/file") {
        const filePath = url.searchParams.get("path")
        if (!filePath) {
          this.writeJson(res, 400, refuse("ECP_REQUEST_INVALID", "Query path is required."))
          return
        }
        const result = readAllowedFile(filePath)
        if (!result.ok) {
          this.writeJson(res, result.code === "ECP_NOT_FOUND" ? 404 : 400, refuse(result.code, result.message))
          return
        }
        res.statusCode = 200
        res.setHeader("Content-Type", "text/plain; charset=utf-8")
        res.end(result.text)
        return
      }
      if (method === "GET" && pathName === "/v1/files") {
        const dir = url.searchParams.get("dir")
        if (!dir) {
          this.writeJson(res, 400, refuse("ECP_REQUEST_INVALID", "Query dir is required."))
          return
        }
        this.writeJson(res, 200, { ok: true, data: { files: listExecutionFiles(dir) } })
        return
      }
      if (method === "POST" && pathName === "/v1/admin/drain") {
        const body = await readJsonBody(req)
        if (!body.ok) {
          this.writeJson(res, body.status, body.envelope)
          return
        }
        const timeoutMs = Number((body.value as { timeoutMs?: number }).timeoutMs ?? 30_000)
        const interrupted = await this.drain(Number.isFinite(timeoutMs) ? timeoutMs : 30_000)
        this.writeJson(res, 200, { ok: true, data: { interrupted } })
        return
      }
      if (method === "POST" && pathName === "/v1/admin/shutdown") {
        this.writeJson(res, 200, { ok: true, data: {} })
        await this.shutdown()
        return
      }

      this.writeJson(res, 404, refuse("ECP_NOT_FOUND", `No route ${method} ${pathName}.`))
    } catch (error) {
      this.ctx.logger.error("http handler failed", { requestId, error })
      this.writeJson(res, 500, refuse("ECP_INTERNAL", "Internal error."))
    }
  }

  private async authorize(headers: Record<string, string | undefined>): Promise<boolean> {
    const auth = this.ctx.services.get(Auth) as AuthService
    const principal = await auth.authenticate({ headers })
    return principal?.principal === "local"
  }

  private async writeHealth(res: ServerResponse): Promise<void> {
    const storage = this.ctx.services.get(StorageProvider) as StorageProviderService
    const plugins = this.ctx.services.get(PluginAdapter) as PluginAdapterService
    const activeRuns = (await storage.runs.list({ status: "running" }, 10_000)).length
    const { lastActivityAt, openStreams } = this.activity.snapshot()
    this.writeJson(res, 200, {
      status: this.health,
      version: VERSION,
      pid: process.pid,
      startedAt: this.startedAt,
      plugins: plugins.plugins().length,
      activeRuns,
      lastActivityAt,
      openStreams,
    })
  }

  /** Stop accepting new runs, wait for active ones, interrupt leftovers. */
  async drain(timeoutMs: number): Promise<string[]> {
    this.draining = true
    this.health = "draining"
    const storage = this.ctx.services.get(StorageProvider) as StorageProviderService
    const running = await storage.runs.list({ status: "running" }, 10_000)
    if (timeoutMs <= 0) {
      for (const record of running) {
        try {
          await this.ops().execute({ cancel: record.id })
        } catch {
          // best effort abort
        }
      }
    } else {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const still = await storage.runs.list({ status: "running" }, 10_000)
        if (still.length === 0) break
        await delay(50)
      }
    }
    const leftover = await storage.runs.list({ status: "running" }, 10_000)
    const also = timeoutMs <= 0 ? await storage.runs.list({ status: "cancelled" }, 10_000) : []
    const interrupted: string[] = []
    const seen = new Set<string>()
    for (const record of [...leftover, ...also]) {
      if (seen.has(record.id)) continue
      seen.add(record.id)
      await markInterrupted(storage, record, "host-restart")
      interrupted.push(record.id)
    }
    return interrupted
  }

  private async shutdown(): Promise<void> {
    await this.stop()
    for (const resolve of this.shutdownResolvers) resolve()
    this.shutdownResolvers = []
    if (this.exitOnShutdown) process.exit(0)
  }

  private async handleWatch(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const types = new Set(
      (url.searchParams.get("types") ?? "run,execution,config")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    const runId = url.searchParams.get("runId") ?? undefined
    const watchPath = url.searchParams.get("path") ?? undefined
    if (watchPath && !watchPath.endsWith(".ecp.json")) {
      this.writeJson(
        res,
        400,
        refuse("ECP_REQUEST_INVALID", "Query path must be an absolute .ecp.json execution file."),
      )
      return
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
    res.write(`: connected\n\n`)
    this.activity.streamOpened()
    const storage = this.ctx.services.get(StorageProvider) as StorageProviderService
    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    const onChange = (change: StorageChange): void => {
      if (!types.has(change.type)) return
      if (runId && change.type === "run" && change.id !== runId) return
      send("storage", change)
    }
    const unwatch = storage.watch(onChange)
    const unwatchPath = watchPath
      ? watchExecutionPath(watchPath, (event) => {
          send("file", event)
        })
      : undefined
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${new Date().toISOString()}\n\n`)
    }, HEARTBEAT_MS)
    const close = (): void => {
      clearInterval(heartbeat)
      unwatch()
      unwatchPath?.()
      this.activity.streamClosed()
    }
    req.on("close", close)
  }

  private writeJson(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(`${JSON.stringify(body)}\n`)
  }
}

function isRunExecute(input: ExecuteInput): boolean {
  if (input.cancel) return false
  if (input.mode === "validate") return false
  return true
}

async function markInterrupted(
  storage: StorageProviderService,
  record: RunRecord,
  reason: string,
): Promise<void> {
  const endedAt = new Date().toISOString()
  await storage.runs.update(record.id, {
    status: "interrupted",
    endedAt,
    durationMs: Date.parse(endedAt) - Date.parse(record.startedAt),
  } as Partial<RunRecord>)
  await storage.runs.appendEvent(record.id, {
    seq: Date.now(),
    type: "run.interrupted",
    at: endedAt,
    data: { reason },
  })
}

function flattenHeaders(
  headers: IncomingMessage["headers"],
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
  }
  return out
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: number; envelope: OperationResponse<never> }
> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > BODY_MAX_BYTES) {
      req.resume()
      return {
        ok: false,
        status: 413,
        envelope: refuse("ECP_REQUEST_INVALID", `Request body exceeds ${BODY_MAX_BYTES} bytes.`),
      }
    }
    chunks.push(buf)
  }
  if (chunks.length === 0) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown }
  } catch {
    return {
      ok: false,
      status: 400,
      envelope: refuse("ECP_REQUEST_INVALID", "Request body must be JSON."),
    }
  }
}
