import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
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
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }
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
 * Stamp under `$ECP_HOME/schema/plugins/index.json` for lazy editor rewrites.
 * @category Host
 */
interface EditorSchemaStamp {
  /** Runtime/editor schemaHash (base + sorted plugin schema hashes). */
  schemaHash: string
  /** Sorted capability ids reflected in the root editor schema. */
  capabilityIds: string[]
  /** Plugin id → `ecp.schema.json` hash from the light manifest. */
  plugins: Record<string, string>
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

/**
 * Write or refresh the root editor schema and per-plugin editor files.
 * A warm start with an unchanged plugin set does not call `loadPluginSchema`.
 * @category Host
 */
async function writeExecutionSchema(host: Host): Promise<string> {
  const {
    canonicalJson,
    generateEditorRootSchema,
    generatePluginEditorSchema,
    safePluginId,
    sha256Hex,
  } = await import("@executioncontrolprotocol/engine")
  const plugins = host.services.get(PluginAdapter)
  const light = plugins.capabilities()
  const fingerprints = plugins.schemaFingerprints()
  const fingerprintById = new Map(fingerprints.map((item) => [item.pluginId, item]))
  const capabilityIds = [...new Set(light.map((entry) => entry.id))].sort()
  const pluginIds = [...new Set(light.map((entry) => entry.plugin))].sort()

  const schemaDir = path.join(host.settings.home, "schema")
  const pluginsDir = path.join(schemaDir, "plugins")
  const rootPath = path.join(schemaDir, "execution.schema.json")
  const indexPath = path.join(pluginsDir, "index.json")

  const desiredPlugins: Record<string, string> = {}
  for (const pluginId of pluginIds) {
    const fingerprint = fingerprintById.get(pluginId)
    if (fingerprint) desiredPlugins[pluginId] = fingerprint.hash
  }

  const base = structuredClone(baseSchema) as Record<string, unknown>
  base.$id = "ecp://host/execution.schema.json"
  const schemaHash = await sha256Hex(
    canonicalJson({
      base,
      plugins: [...fingerprints]
        .map((item) => ({ id: item.pluginId, version: item.version, hash: item.hash }))
        .sort((left, right) => {
          if (left.id !== right.id) return left.id < right.id ? -1 : 1
          if (left.version !== right.version) return left.version < right.version ? -1 : 1
          return left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0
        }),
    }),
  )

  const previous = await readStamp(indexPath)
  const stampMatches =
    previous !== undefined &&
    previous.schemaHash === schemaHash &&
    arraysEqual(previous.capabilityIds, capabilityIds) &&
    recordsEqual(previous.plugins, desiredPlugins)

  let rootOk = false
  try {
    await stat(rootPath)
    rootOk = true
  } catch {
    rootOk = false
  }

  const missingPluginFiles: string[] = []
  for (const pluginId of pluginIds) {
    const target = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
    try {
      await stat(target)
    } catch {
      missingPluginFiles.push(pluginId)
    }
  }

  if (stampMatches && rootOk && missingPluginFiles.length === 0) {
    return schemaHash
  }

  await mkdir(pluginsDir, { recursive: true })

  const changedPluginIds = new Set<string>(missingPluginFiles)
  for (const pluginId of pluginIds) {
    if (previous?.plugins[pluginId] !== desiredPlugins[pluginId]) changedPluginIds.add(pluginId)
  }
  for (const pluginId of Object.keys(previous?.plugins ?? {})) {
    if (!(pluginId in desiredPlugins)) {
      const stale = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
      await rm(stale, { force: true })
    }
  }

  for (const pluginId of changedPluginIds) {
    const document = await plugins.loadPluginSchema(pluginId)
    if (!document) continue
    const pluginCaps = light.filter((entry) => entry.plugin === pluginId)
    const editor = generatePluginEditorSchema(pluginId, pluginCaps, document)
    const target = path.join(pluginsDir, `${safePluginId(pluginId)}.editor.schema.json`)
    await writeFile(target, `${JSON.stringify(editor, null, 2)}\n`, "utf8")
  }

  const rootNeeded =
    !rootOk ||
    !previous ||
    previous.schemaHash !== schemaHash ||
    !arraysEqual(previous.capabilityIds, capabilityIds) ||
    changedPluginIds.size > 0
  if (rootNeeded) {
    const root = generateEditorRootSchema(light)
    await mkdir(schemaDir, { recursive: true })
    await writeFile(rootPath, `${JSON.stringify(root, null, 2)}\n`, "utf8")
  }

  const stamp: EditorSchemaStamp = {
    schemaHash,
    capabilityIds,
    plugins: desiredPlugins,
  }
  await writeFile(indexPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
  return schemaHash
}

async function readStamp(indexPath: string): Promise<EditorSchemaStamp | undefined> {
  try {
    const text = await readFile(indexPath, "utf8")
    const parsed = JSON.parse(text) as EditorSchemaStamp
    if (
      typeof parsed.schemaHash !== "string" ||
      !Array.isArray(parsed.capabilityIds) ||
      typeof parsed.plugins !== "object" ||
      parsed.plugins === null
    ) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function recordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (!arraysEqual(leftKeys, rightKeys)) return false
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }
  return true
}
