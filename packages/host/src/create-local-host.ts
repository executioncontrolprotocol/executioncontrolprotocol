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
  ExpressionEngine,
  Formatter,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
  type ExpressionEngine as ExpressionEngineService,
  type Formatter as FormatterService,
  type HostSettings,
  type PluginAdapter as PluginAdapterService,
  type RunRecord,
  type SecretsProvider as SecretsProviderService,
  type StorageProvider as StorageProviderService,
} from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "@executioncontrolprotocol/quickjs"

/**
 * Options for {@link createLocalHost}.
 * @category Host
 */
export interface CreateLocalHostOptions {
  /** Absolute `ECP_HOME`. */
  home: string
  /** `in-process` for Phase 3; `server` adds HTTP in Phase 4. */
  mode?: "in-process" | "server"
  /** Extra plugin package roots (tests). */
  extraPlugins?: string[]
  /** Log level. */
  logLevel?: HostSettings["logLevel"]
  /** Override default step timeout. */
  defaultStepTimeoutMs?: number
  /** Override default concurrency. */
  defaultMaxConcurrency?: number
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
 * Local host with disk services. Phase 3 covers `mode: "in-process"` only.
 * @category Host
 */
export interface LocalHost extends Host {
  /** Startup timing. */
  readonly timing: LocalHostTiming
  /** Stable schema hash written at startup. */
  readonly schemaHash: string
}

/**
 * Compose the local in-process host and run the startup sequence.
 * @category Host
 */
export async function createLocalHost(options: CreateLocalHostOptions): Promise<LocalHost> {
  if (options.mode === "server") {
    throw new Error('createLocalHost mode "server" lands in Phase 4.')
  }
  const started = Date.now()
  await mkdir(options.home, { recursive: true })

  const writeTextFile = async (filePath: string, text: string): Promise<void> => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, text, "utf8")
  }

  const host = await createEnvironment()
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
    .start({
      home: options.home,
      mode: "in-process",
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

  return {
    services: host.services,
    operations: host.operations,
    settings: host.settings,
    stop: () => host.stop(),
    timing: { startMs, interruptMs, schemaMs },
    schemaHash,
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
