import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { createEnvironment, type Host, type ResolvedHostSettings, type ServiceClass } from "@executioncontrolprotocol/engine"
import { JsonFormatter, ToonFormatter } from "@executioncontrolprotocol/formatters"
import {
  LocalPluginRegistration,
  LocalSecrets,
  LocalStorage,
} from "@executioncontrolprotocol/local"
import {
  Auth,
  Endpoint,
  EditorSchemaFiles,
  ExpressionEngine,
  Formatter,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
  type Auth as AuthService,
  type Endpoint as EndpointService,
  type EditorSchemaFiles as EditorSchemaFilesService,
  type ExpressionEngine as ExpressionEngineService,
  type Formatter as FormatterService,
  type HostSettings,
  type PluginAdapter as PluginAdapterService,
  type RunRecord,
  type SecretsProvider as SecretsProviderService,
  type StorageProvider as StorageProviderService,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "@executioncontrolprotocol/quickjs"
import { LocalTokenAuth } from "./auth/local-token-auth.js"
import {
  computeEditorSchemaHash,
  EDITOR_SCHEMA_SHUTDOWN_WAIT_MS,
  writeEditorSchemaFiles,
  type EditorSchemaWriteResult,
} from "./editor-schema.js"
import { LocalEditorSchemaFiles, type EditorSchemaWriteRef } from "./editor-schema-files.js"
import { HttpApiEndpoint } from "./http/http-api-endpoint.js"
import { generateHostToken } from "./token.js"

/**
 * Options for {@link createLocalHost}.
 * @category Host
 */
export interface CreateLocalHostOptions {
  /** Absolute `ECP_HOME`. */
  home: string
  /** `in-process` skips HTTP; `server` binds Auth + HttpApiEndpoint. */
  mode?: "in-process" | "server"
  /** Listen port when `mode` is `server`. `0` picks an ephemeral port. */
  port?: number
  /** Bearer token when `mode` is `server`. Generated when omitted. */
  token?: string
  /** Extra plugin package roots (tests). */
  extraPlugins?: string[]
  /** Log level. */
  logLevel?: HostSettings["logLevel"]
  /** Override default step timeout. */
  defaultStepTimeoutMs?: number
  /** Override default concurrency. */
  defaultMaxConcurrency?: number
  /** When true, admin shutdown calls `process.exit(0)`. */
  exitOnShutdown?: boolean
  /** Absolute path to the App `dist/web` bundle (server mode). */
  appRoot?: string
}

/**
 * Startup timing breakdown recorded on the host.
 * @category Host
 */
export interface LocalHostTiming {
  /** Milliseconds spent constructing and starting services. */
  startMs: number
  /** Milliseconds spent marking leftover runs interrupted. */
  interruptMs: number
  /** Milliseconds spent on editor schema work at start (in-process: full write; server: hash only). */
  schemaMs: number
}

/**
 * Local host with disk services, optionally listening on HTTP.
 * @category Host
 */
export interface LocalHost extends Host {
  /** Startup timing. */
  readonly timing: LocalHostTiming
  /** Stable schema hash written at startup. */
  readonly schemaHash: string
  /**
   * Resolves when editor files are written (server: may finish after ready; in-process: before return).
   * @category Host
   */
  readonly editorSchemas: Promise<EditorSchemaWriteResult>
  /** Bound HTTP URL when `mode` is `server`. */
  readonly url?: string
  /** Token used by the HTTP API when `mode` is `server`. */
  readonly token?: string
  /** Resolves when `/v1/admin/shutdown` completes (server mode). */
  whenShutdown(): Promise<void>
}

/**
 * Compose the local host and run the startup sequence.
 * @category Host
 */
export async function createLocalHost(options: CreateLocalHostOptions): Promise<LocalHost> {
  const mode = options.mode ?? "in-process"
  const started = Date.now()
  await mkdir(options.home, { recursive: true })

  const writeTextFile = async (filePath: string, text: string): Promise<void> => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, text, "utf8")
  }

  const token = mode === "server" ? (options.token ?? generateHostToken()) : undefined
  const port = mode === "server" ? (options.port ?? 0) : undefined

  const editorWriteRef: EditorSchemaWriteRef = {
    promise: Promise.resolve({ ms: 0 }),
  }

  let env = createEnvironment()
    .use(LocalPluginRegistration as ServiceClass<PluginAdapterService>, PluginAdapter, {
      options: {
        dataDir: path.join(options.home, "plugins"),
        extraPlugins: options.extraPlugins,
      },
    })
    .use(LocalStorage as ServiceClass<StorageProviderService>, StorageProvider)
    .use(LocalSecrets as ServiceClass<SecretsProviderService>, SecretsProvider)
    .use(QuickJsExpressionEngine as ServiceClass<ExpressionEngineService>, ExpressionEngine)
    .use(JsonFormatter as ServiceClass<FormatterService>, Formatter, { default: true })
    .use(ToonFormatter as ServiceClass<FormatterService>, Formatter)
    .use(LocalEditorSchemaFiles as ServiceClass<EditorSchemaFilesService>, EditorSchemaFiles, {
      options: { writeRef: editorWriteRef },
    })

  if (mode === "server") {
    const listenPort = port ?? 0
    env = env
      .use(LocalTokenAuth as ServiceClass<AuthService>, Auth, {
        options: { token: token!, port: listenPort },
      })
      .use(HttpApiEndpoint as ServiceClass<EndpointService>, Endpoint, {
        options: {
          port: listenPort,
          token: token!,
          exitOnShutdown: options.exitOnShutdown === true,
          ...(options.appRoot ? { appRoot: options.appRoot } : {}),
        },
      })
  }

  const host = await env.start({
    home: options.home,
    mode,
    extraPlugins: options.extraPlugins,
    logLevel: options.logLevel,
    defaultStepTimeoutMs: options.defaultStepTimeoutMs,
    defaultMaxConcurrency: options.defaultMaxConcurrency,
    writeTextFile,
  } as HostSettings & { writeTextFile: typeof writeTextFile })

  const startMs = Date.now() - started

  const interruptStarted = Date.now()
  await markInterruptedRuns(host.settings, host.services.get(StorageProvider))
  const interruptMs = Date.now() - interruptStarted

  const schemaStarted = Date.now()
  const schemaHash = await computeEditorSchemaHash(host)
  const hashMs = Date.now() - schemaStarted

  const logEditorError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`editor schema write failed: ${message}`)
  }

  let editorSchemas: Promise<EditorSchemaWriteResult>
  let schemaMs: number

  if (mode === "server") {
    schemaMs = hashMs
    editorSchemas = writeEditorSchemaFiles(host, { onError: logEditorError })
    editorWriteRef.promise = editorSchemas
  } else {
    const writeStarted = Date.now()
    editorSchemas = writeEditorSchemaFiles(host, { onError: logEditorError })
    editorWriteRef.promise = editorSchemas
    await editorSchemas
    schemaMs = Date.now() - writeStarted
  }

  let url: string | undefined
  let whenShutdown = async (): Promise<void> => undefined
  let endpoint: HttpApiEndpoint | undefined
  if (mode === "server") {
    endpoint = host.services.get(Endpoint, HttpApiEndpoint.id) as HttpApiEndpoint
    const auth = host.services.get(Auth) as LocalTokenAuth
    auth.setPort(endpoint.port)
    endpoint.bindOperations(host.operations)
    endpoint.setEditorSchemaGate(() => editorSchemas)
    endpoint.markReady()
    url = endpoint.url
    whenShutdown = () => endpoint!.whenShutdown()
  }

  const baseStop = host.stop.bind(host)
  const stop = async (): Promise<void> => {
    try {
      await Promise.race([editorSchemas, delay(EDITOR_SCHEMA_SHUTDOWN_WAIT_MS)])
    } catch {
      // write errors are already logged
    }
    await baseStop()
  }

  return {
    services: host.services,
    operations: host.operations,
    settings: host.settings,
    stop,
    timing: { startMs, interruptMs, schemaMs },
    schemaHash,
    editorSchemas,
    url,
    token,
    whenShutdown,
  }
}

async function markInterruptedRuns(
  settings: ResolvedHostSettings,
  storage: StorageProviderService,
): Promise<void> {
  void settings
  const running = await storage.runs.list({ status: "running" }, 10_000)
  for (const record of running) {
    const endedAt = new Date().toISOString()
    await storage.runs.update(record.id, {
      status: "interrupted",
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(record.startedAt),
    } as Partial<RunRecord>)
    await storage.runs.appendEvent(record.id, {
      seq: 1,
      type: "run.interrupted",
      at: endedAt,
      data: { reason: "host-restart" },
    })
  }
}
