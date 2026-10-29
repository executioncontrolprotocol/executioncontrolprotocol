import { createHash } from "node:crypto"
import { watch, existsSync, type FSWatcher } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path"
import {
  APP_BEARER_PREFIX,
  APP_TOKEN_QUERY,
  APP_WATCH_DEBOUNCE_MS,
  canRoundTrip,
  environmentSourceFromDescriptor,
  type AppEnvironmentResponse,
  type AppEventMessage,
  type AppRunRequest,
  type AppSourceResponse,
  type AppSourceWrite,
} from "@executioncontrolprotocol/app"
import type { Ecp, EnvironmentBinding, LoadedWorkflow } from "@executioncontrolprotocol/core"
import {
  extension,
  isBuiltinRequirementId,
  MEDIA_HTTP_PATH,
  MediaStore,
  policy,
} from "@executioncontrolprotocol/core"
import {
  NODE_ENVIRONMENT_ID,
  compileAndValidateWorkflowSource,
  environment,
  handleMediaHttp,
  journalExtension,
  loadConfigModule,
  loadWorkflowFile,
} from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"
import {
  ECP_PLUGINS_MISSING,
  EcpError,
  type PublicRunEvent,
  type ValidationResult,
} from "@executioncontrolprotocol/core/types"
import { WebSocketServer, type WebSocket } from "ws"
import { APP_TOKEN_COOKIE, DEFAULT_PLUGIN_APP_HOST, DEFAULT_PLUGIN_APP_PORT } from "./constants.js"
import { assertLoopbackBind } from "./http-bind.js"
import { workflowLoadError } from "./load-error.js"
import { openBrowser } from "./open-browser.js"
import { generateAppToken, tokenFromRequest, tokensEqual } from "./token.js"
import { resolveAppWebRoot } from "./web-root.js"

const MIME_BY_EXT: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

/**
 * Options for {@link serveApp}.
 * @category App
 */
export interface ServeAppOptions {
  /** Process host from `getHost()` after `init-host`. */
  host: EcpHost
  /**
   * Optional `--config` file. Merged onto a clone of the process host; never
   * replaces installed plugins. The Environment tab always shows `describe()`.
   */
  configPath?: string
  /** Workflow file the App watches. */
  filePath: string
  /** Bind address. Defaults to `127.0.0.1`. */
  httpHost?: string
  /** Bind port. `0` asks the OS for an ephemeral port. */
  httpPort?: number
  /** Pairing token. Generated when omitted. */
  token?: string
  /** Print the listen URL (includes the token) once to stderr. Tests set false. */
  printListenUrl?: boolean
  /** Open the default browser. Tests pass false (`--no-open`). */
  open?: boolean
  /**
   * When true, the returned promise settles only after the HTTP server closes.
   * The CLI sets this so `ecp app` stays running.
   */
  block?: boolean
  /** Override the static bundle directory (tests). */
  webRoot?: string
}

/**
 * Handle for a listening App server.
 * @category App
 */
export interface AppServeHandle {
  /** Bind address actually listening. */
  host: string
  /** Bind port actually listening. */
  port: number
  /** Pairing token required on every request. Never log in tests. */
  token: string
  /** Absolute workflow file path. */
  filePath: string
  /** URL that opens the App (includes the token). */
  url: string
  /** Underlying Node HTTP server. */
  httpServer: Server
  /** Stop watching, close sockets, close HTTP. */
  close: () => Promise<void>
}

function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex")
}

function requestUrl(req: IncomingMessage, fallbackHost: string): URL {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? fallbackHost}`)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  })
  res.end(payload)
}

function sendText(res: ServerResponse, status: number, body: string, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  })
  res.end(body)
}

function cookieHeader(token: string): string {
  return `${APP_TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`
}

function safeStaticPath(webRoot: string, urlPath: string): string | undefined {
  const decoded = decodeURIComponent(urlPath)
  const relativePath = decoded.replace(/^\/+/, "")
  const full = resolve(webRoot, relativePath === "" ? "index.html" : relativePath)
  const rel = relative(resolve(webRoot), full)
  if (rel.startsWith("..") || isAbsolute(rel) || relativePath.includes("\0")) return undefined
  return full
}

async function loadEnvironmentSnapshot(ecp: Ecp): Promise<AppEnvironmentResponse> {
  return {
    kind: "process-host",
    source: environmentSourceFromDescriptor(await ecp.describe()),
  }
}

function bindingId(binding: EnvironmentBinding): string {
  const ref = binding.getRef()
  if (typeof ref === "string") return ref
  if (typeof ref === "object" && ref !== null && "id" in ref) return String(ref.id)
  return String(ref)
}

function assertConfigPluginsOnHost(host: EcpHost, bindings: EnvironmentBinding[]): void {
  const missing: string[] = []
  for (const binding of bindings) {
    const id = bindingId(binding)
    if (isBuiltinRequirementId(id)) continue
    if (host.registry.getExtension(id) || host.registry.getPolicy(id)) continue
    missing.push(id)
  }
  if (missing.length === 0) return
  throw new EcpError(
    ECP_PLUGINS_MISSING,
    `Missing plugins: ${missing.join(", ")}`,
    { suggestions: missing.map((id) => `ecp plugins install ${id}`) }
  )
}

async function initConfiguredHost(
  configPath: string,
  base: EcpHost
): Promise<{ host: EcpHost; ecp: Ecp }> {
  const env = environment(NODE_ENVIRONMENT_ID, "cli")
  for (const def of base.registry.listExtensions()) {
    env.with([extension(def)])
  }
  for (const def of base.registry.listPolicies()) {
    env.with([policy(def)])
  }
  const bindings = await loadConfigModule(configPath)
  assertConfigPluginsOnHost(base, bindings)
  env.with(bindings)
  env.with([extension(journalExtension)])
  const ecp = await env.init()
  return {
    ecp,
    host: {
      ...base,
      ecp,
      registry: ecp.getRegistry(),
      environmentId: ecp.id,
    },
  }
}

async function loadSnapshot(filePath: string): Promise<AppSourceResponse> {
  const source = await readFile(filePath, "utf8")
  const roundTrip = canRoundTrip(source)
  try {
    const loaded: LoadedWorkflow = await loadWorkflowFile(filePath)
    return {
      path: filePath,
      source,
      manifest: loaded.manifest,
      requirements: loaded.requirements,
      roundTrip,
    }
  } catch (err) {
    return {
      path: filePath,
      source,
      roundTrip,
      loadError: workflowLoadError(err),
    }
  }
}

/**
 * Serve the App bundle and HostAdapter HTTP/WS API on loopback.
 * @category App
 */
export async function serveApp(options: ServeAppOptions): Promise<AppServeHandle> {
  const httpHost = options.httpHost ?? DEFAULT_PLUGIN_APP_HOST
  assertLoopbackBind(httpHost)
  const token = options.token ?? generateAppToken()
  const filePath = resolve(options.filePath)
  const configPath = options.configPath ? resolve(options.configPath) : undefined
  const webRoot = options.webRoot ?? resolveAppWebRoot()
  const sockets = new Set<WebSocket>()
  let lastWriteHash: string | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined
  let configDebounce: ReturnType<typeof setTimeout> | undefined
  let configuredEcp: Ecp | undefined
  let runtimeHost = options.host
  if (configPath) {
    const configured = await initConfiguredHost(configPath, options.host)
    configuredEcp = configured.ecp
    runtimeHost = configured.host
  }

  const broadcast = (message: AppEventMessage): void => {
    const payload = JSON.stringify(message)
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(payload)
    }
  }

  const pushFileChange = async (): Promise<void> => {
    let source: string
    try {
      source = await readFile(filePath, "utf8")
    } catch (err) {
      broadcast({
        type: "file",
        source: "",
        loadError: workflowLoadError(err),
        roundTrip: { ok: false, reasons: ["Workflow file could not be read"] },
      })
      return
    }
    if (lastWriteHash !== undefined && hashSource(source) === lastWriteHash) return
    const snapshot = await loadSnapshot(filePath)
    broadcast({
      type: "file",
      source: snapshot.source,
      manifest: snapshot.manifest,
      loadError: snapshot.loadError,
      roundTrip: snapshot.roundTrip,
    })
  }

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    const given = tokenFromRequest(url, {
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    })
    return given !== undefined && tokensEqual(given, token)
  }

  const handleApi = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const method = req.method ?? "GET"
    if (method === "GET" && url.pathname === "/api/source") {
      sendJson(res, 200, await loadSnapshot(filePath), { "Set-Cookie": cookieHeader(token) })
      return
    }
    if (method === "PUT" && url.pathname === "/api/source") {
      const body = (await readJsonBody(req)) as AppSourceWrite
      if (typeof body.source !== "string") {
        sendJson(res, 400, workflowLoadError(new Error("PUT /api/source requires { source }")))
        return
      }
      lastWriteHash = hashSource(body.source)
      await writeFile(filePath, body.source, "utf8")
      sendJson(res, 200, await loadSnapshot(filePath))
      return
    }
    if (method === "GET" && url.pathname === "/api/environment") {
      sendJson(res, 200, await loadEnvironmentSnapshot(runtimeHost.ecp))
      return
    }
    if (method === "GET" && url.pathname === "/api/describe") {
      sendJson(res, 200, await runtimeHost.ecp.describe())
      return
    }
    if (method === "GET" && url.pathname === "/api/search") {
      const query = url.searchParams.get("q") ?? ""
      const envelope = await runtimeHost.ecp.search(query)
      sendJson(res, 200, { results: envelope.results })
      return
    }
    if (method === "POST" && url.pathname === "/api/validate") {
      const body = (await readJsonBody(req)) as { source?: string }
      if (typeof body.source !== "string") {
        sendJson(res, 400, workflowLoadError(new Error("POST /api/validate requires { source }")))
        return
      }
      const compiled = await compileAndValidateWorkflowSource({
        source: body.source,
        filename: filePath,
        descriptor: await runtimeHost.ecp.describe(),
      })
      if (!compiled.ok || !compiled.manifest) {
        const fallback: ValidationResult = compiled.validation ?? workflowLoadError(
          new Error(compiled.compileErrors?.[0]?.message ?? "Workflow failed to compile")
        )
        sendJson(res, 200, fallback)
        return
      }
      sendJson(res, 200, await runtimeHost.ecp.validate(compiled.manifest))
      return
    }
    if (method === "POST" && url.pathname === "/api/run") {
      const body = (await readJsonBody(req)) as AppRunRequest
      if (typeof body.source !== "string") {
        sendJson(res, 400, workflowLoadError(new Error("POST /api/run requires { source }")))
        return
      }
      lastWriteHash = hashSource(body.source)
      await writeFile(filePath, body.source, "utf8")
      let loaded: LoadedWorkflow
      try {
        loaded = await loadWorkflowFile(filePath)
      } catch (err) {
        sendJson(res, 400, workflowLoadError(err))
        return
      }
      const result = await runtimeHost.ecp.run(loaded.manifest, {
        input: body.input && typeof body.input === "object" && !Array.isArray(body.input)
          ? (body.input as Record<string, unknown>)
          : undefined,
        onEvent: (event: PublicRunEvent) => {
          broadcast({ type: "run", event })
        },
        journal: {
          workflowPath: filePath,
          workflowHash: lastWriteHash,
          environmentId: runtimeHost.environmentId ?? NODE_ENVIRONMENT_ID,
        },
      })
      sendJson(res, 200, {
        runId: result.run.id,
        status: result.run.status,
        output: result.output,
        diagnostics: result.diagnostics,
        history: result.history,
      })
      return
    }
    sendText(res, 404, "Not found")
  }

  const handleStatic = async (res: ServerResponse, url: URL): Promise<void> => {
    const file = safeStaticPath(webRoot, url.pathname === "/" ? "/index.html" : url.pathname)
    if (!file || !existsSync(file)) {
      sendText(res, 404, "Not found")
      return
    }
    const bytes = await readFile(file)
    const type = MIME_BY_EXT[extname(file)] ?? "application/octet-stream"
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": bytes.byteLength,
      "Set-Cookie": cookieHeader(token),
    })
    res.end(bytes)
  }

  const httpServer = createServer((req, res) => {
    const url = requestUrl(req, httpHost)
    if (!authorized(req, url)) {
      sendText(res, 401, "Unauthorized", { "WWW-Authenticate": APP_BEARER_PREFIX.trim() })
      return
    }
    void (async () => {
      try {
        const mediaStore = runtimeHost.ecp.getService(MediaStore)
        if (mediaStore && url.pathname === MEDIA_HTTP_PATH) {
          const method = req.method ?? "GET"
          const mediaBody = method === "POST" ? await readJsonBody(req) : undefined
          const media = await handleMediaHttp({
            store: mediaStore,
            method,
            url,
            body: mediaBody,
          })
          if (media) {
            sendJson(res, media.status, media.json)
            return
          }
        }
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url)
          return
        }
        await handleStatic(res, url)
      } catch (err) {
        if (!res.headersSent) sendJson(res, 500, workflowLoadError(err))
      }
    })()
  })

  const wss = new WebSocketServer({ noServer: true })
  wss.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("close", () => {
      sockets.delete(socket)
    })
  })

  httpServer.on("upgrade", (req, socket, head) => {
    const url = requestUrl(req, httpHost)
    if (url.pathname !== "/api/events" || !authorized(req, url)) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  })

  await new Promise<void>((resolveListen, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(options.httpPort ?? DEFAULT_PLUGIN_APP_PORT, httpHost, () => resolveListen())
  })

  const pushEnvironmentChange = async (): Promise<void> => {
    if (configPath) {
      const next = await initConfiguredHost(configPath, options.host)
      if (configuredEcp) {
        try {
          await configuredEcp.terminate()
        } catch {
          /* already closed */
        }
      }
      configuredEcp = next.ecp
      runtimeHost = next.host
    }
    const snapshot = await loadEnvironmentSnapshot(runtimeHost.ecp)
    broadcast({
      type: "environment",
      kind: snapshot.kind,
      source: snapshot.source,
    })
  }

  const watchedName = basename(filePath)
  const watcher = watch(dirname(filePath), (_event, filename) => {
    const name = filename === null || filename === undefined ? "" : String(filename)
    if (name && name !== watchedName) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      void pushFileChange()
    }, APP_WATCH_DEBOUNCE_MS)
  })

  let configWatcher: FSWatcher | undefined
  if (configPath) {
    const configName = basename(configPath)
    configWatcher = watch(dirname(configPath), (_event, filename) => {
      const name = filename === null || filename === undefined ? "" : String(filename)
      if (name && name !== configName) return
      if (configDebounce) clearTimeout(configDebounce)
      configDebounce = setTimeout(() => {
        configDebounce = undefined
        void pushEnvironmentChange()
      }, APP_WATCH_DEBOUNCE_MS)
    })
  }

  const address = httpServer.address() as AddressInfo
  const boundHost = address.address === "::1" ? "127.0.0.1" : address.address
  const url = `http://${boundHost}:${address.port}/?${APP_TOKEN_QUERY}=${token}`

  const close = async (): Promise<void> => {
    if (debounce) clearTimeout(debounce)
    if (configDebounce) clearTimeout(configDebounce)
    watcher.close()
    configWatcher?.close()
    for (const socket of sockets) socket.close()
    sockets.clear()
    await new Promise<void>((resolveClose) => {
      wss.close(() => resolveClose())
    })
    await new Promise<void>((resolveClose, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolveClose()))
    })
    if (configuredEcp) {
      try {
        await configuredEcp.terminate()
      } catch {
        /* already closed */
      }
    }
  }

  const handle: AppServeHandle = {
    host: boundHost,
    port: address.port,
    token,
    filePath,
    url,
    httpServer,
    close,
  }

  if (options.printListenUrl !== false) {
    process.stderr.write(`ECP App listening on ${url}\n`)
  }
  if (options.open !== false) {
    openBrowser(url)
  }
  if (options.block) {
    await new Promise<void>((resolveBlock) => {
      const stop = (): void => {
        void handle.close().finally(resolveBlock)
      }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      httpServer.once("close", resolveBlock)
    })
  }
  return handle
}
