import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  createEnvironment,
  generateExecutionSchema,
  type Host,
  type ResolvedHostSettings,
  type ServiceClass,
} from "@executioncontrolprotocol/engine"
import { JsonFormatter, ToonFormatter } from "@executioncontrolprotocol/formatters"
import {
  LocalPluginRegistration,
  LocalSecrets,
  LocalStorage,
} from "@executioncontrolprotocol/local"
import {
  Auth,
  Endpoint,
  ExpressionEngine,
  Formatter,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
  type Auth as AuthService,
  type Endpoint as EndpointService,
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
  /** Milliseconds spent writing the editor schema. */
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
  const schemaHash = await writeExecutionSchema(host)
  const schemaMs = Date.now() - schemaStarted

  let url: string | undefined
  let whenShutdown = async (): Promise<void> => undefined
  if (mode === "server") {
    const endpoint = host.services.get(Endpoint, HttpApiEndpoint.id) as HttpApiEndpoint
    const auth = host.services.get(Auth) as LocalTokenAuth
    auth.setPort(endpoint.port)
    endpoint.bindOperations(host.operations)
    endpoint.markReady()
    url = endpoint.url
    whenShutdown = () => endpoint.whenShutdown()
  }

  return {
    services: host.services,
    operations: host.operations,
    settings: host.settings,
    stop: () => host.stop(),
    timing: { startMs, interruptMs, schemaMs },
    schemaHash,
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

async function writeExecutionSchema(host: Host): Promise<string> {
  const plugins = host.services.get(PluginAdapter)
  const schema = generateExecutionSchema(plugins.capabilities())
  const { sha256Hex, canonicalJson } = await import("@executioncontrolprotocol/engine")
  const schemaHash = await sha256Hex(canonicalJson(schema))
  const target = path.join(host.settings.home, "schema", "execution.schema.json")
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
  return schemaHash
}
