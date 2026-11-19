import type { ExecutionManifest } from "./manifest.js"
import type {
  CapabilityEntry,
  ConfigObject,
  RunDetail,
  RunFilter,
  RunRecord,
  StepRecord,
  StorageChange,
  StoredExecution,
  StoredExecutionSummary,
} from "./objects.js"
import type { RunEvent } from "./objects.js"
import type { ValidationIssue } from "./validation.js"
import type { HandlerContextInit, HandlerStore, PluginSchemaDocument } from "./plugins.js"

/**
 * Token for one service interface. `multiple` allows more than one implementation.
 * @category Services
 */
export interface ServiceToken<T> {
  /** Stable id. */
  readonly id: string
  /** Whether more than one implementation may be registered. */
  readonly multiple: boolean
  /** Phantom type. Present only so the token carries `T`. */
  readonly __type?: T
}

/**
 * Optional lifecycle hooks. `start` runs after every constructor; `stop` runs
 * in reverse registration order.
 * @category Services
 */
export interface Lifecycle {
  /** Called once the container has constructed every service. */
  start?(): Promise<void>
  /** Called when the host shuts down. */
  stop?(): Promise<void>
}

/**
 * Thrown when expression evaluation fails. `code` is an `ECP_EXPR_*` code.
 * @category Services
 */
export interface ExpressionError extends Error {
  /** Catalogue code. */
  code: "ECP_EXPR_FAILED" | "ECP_EXPR_TIMEOUT" | "ECP_EXPR_RESULT_INVALID"
}

/**
 * Reads manifests and calls capabilities. Must not import plugin code until `call`.
 * @category Services
 */
export interface PluginAdapter extends Lifecycle {
  /**
   * Light capability rows from manifests (no `accepts` / `returns` embeds).
   * Full entries are assembled lazily for `retrieve --id` and validation.
   */
  capabilities(): CapabilityEntry[]
  /** Installed plugins, including ones whose manifest failed. */
  plugins(): PluginInfo[]
  /** Config schema for a plugin, when it declares one. */
  configSchema(pluginId: string): JsonSchema | undefined
  /**
   * Load the plugin's {@link PluginSchemaDocument} when available.
   * Returns `undefined` when the plugin is missing or its manifest failed.
   * Missing or invalid `ecp.schema.json` marks the plugin `manifestOk: false`.
   */
  loadPluginSchema(pluginId: string): Promise<PluginSchemaDocument | undefined>
  /**
   * Light-manifest schema fingerprints for `schemaHash` and host-lifetime cache invalidation.
   * Does not read `ecp.schema.json`.
   */
  schemaFingerprints(): readonly PluginSchemaFingerprint[]
  /** Import the plugin if needed and invoke the capability. */
  call(request: CapabilityCall, signal: AbortSignal): Promise<unknown>
}

/**
 * Plugin schema document identity used in {@link ValidationResult.schemaHash}.
 * @category Plugins
 */
export interface PluginSchemaFingerprint {
  /** Plugin id. */
  pluginId: string
  /** Plugin package version. */
  version: string
  /** Hash of `ecp.schema.json` from the light manifest. */
  hash: string
}

/**
 * Plugin row returned by {@link PluginAdapter.plugins}.
 * @category Services
 */
export interface PluginInfo {
  /** npm package name. */
  package: string
  /** Plugin id. */
  id: string
  /** Package version. */
  version: string
  /** Where it was loaded from. */
  source: "user" | "link" | "core"
  /** Registered capability ids. Empty when `manifestOk` is false. */
  capabilities: string[]
  /** True after the plugin module has been imported. */
  loaded: boolean
  /** False when the manifest is missing, invalid or duplicates a capability id. */
  manifestOk: boolean
  /** Why the manifest was rejected. */
  issues?: ValidationIssue[]
}

/**
 * One capability invocation.
 * @category Services
 */
export interface CapabilityCall {
  /** Capability id. */
  capabilityId: string
  /** Resolved and validated input. */
  input: unknown
  /** Resolved config, secrets included. Absent when the plugin has no config. */
  config: Record<string, unknown> | undefined
  /** Values the host passes into the handler context. */
  context: HandlerContextInit
  /** Staged writes for this step. Present when the host builds a full handler context. */
  store?: HandlerStore
  /** Optional sink for `ctx.usage.record` (executor writes these onto the step record). */
  usage?: {
    /** Append one usage entry. */
    record(entry: { kind: string; amount: number; unit: string; detail?: unknown }): void
  }
  /** Directory of the execution file for resolving relative `file` refs and `$script` paths. */
  executionDir?: string
}

/**
 * JSON Schema object. Plugins author these with zod and export JSON Schema.
 * @category Services
 */
export type JsonSchema = Record<string, unknown>

/**
 * Persisted executions, configs, runs and the files they reference.
 * @category Services
 */
export interface StorageProvider extends Lifecycle {
  /** Load one execution. */
  getExecution(id: string): Promise<StoredExecution | undefined>
  /** List executions, most recently updated first. */
  listExecutions(): Promise<StoredExecutionSummary[]>
  /** Create or replace an execution. */
  putExecution(
    id: string,
    manifest: ExecutionManifest,
    opts: { ifVersion?: number; create?: boolean; warnings?: ValidationIssue[] },
  ): Promise<{ version: number }>
  /** Delete an execution at a known version. */
  deleteExecution(id: string, ifVersion: number): Promise<void>
  /** Load one config. */
  getConfig(id: string): Promise<ConfigObject | undefined>
  /** List configs, optionally for one plugin id or short name. */
  listConfigs(plugin?: string): Promise<ConfigObject[]>
  /** Create or replace a config. */
  putConfig(config: ConfigObject, opts: { ifVersion?: number; create?: boolean }): Promise<{ version: number }>
  /** Delete a config at a known version. */
  deleteConfig(id: string, ifVersion: number): Promise<void>
  /** Read an execution file for `{ path }` executions. */
  readExecutionFile(absolutePath: string): Promise<string>
  /** Read a `$script.path` file. */
  readTextFile(absolutePath: string): Promise<string>
  /** Run records, events and state. */
  readonly runs: RunStore
  /** Subscribe to store changes. The return value unsubscribes. */
  watch(listener: (change: StorageChange) => void): () => void
}

/**
 * Run records under a {@link StorageProvider}.
 * @category Services
 */
export interface RunStore {
  /** Create a run and store the manifest copy used to resume. */
  create(record: RunRecord, manifest: ExecutionManifest): Promise<void>
  /** Merge fields into a run record. */
  update(id: string, patch: Partial<RunRecord>): Promise<void>
  /** Write one step record. */
  writeStep(runId: string, step: StepRecord): Promise<void>
  /** Persist state after a committed step. */
  writeState(runId: string, state: unknown): Promise<void>
  /** Append one event. */
  appendEvent(runId: string, event: RunEvent): Promise<void>
  /** Load a run, with the requested detail sections. */
  get(id: string, include?: Array<"steps" | "events" | "state">): Promise<RunDetail | undefined>
  /** Manifest copy stored with the run. */
  getManifest(id: string): Promise<ExecutionManifest | undefined>
  /** List runs, most recent first. */
  list(filter: RunFilter, limit: number): Promise<RunRecord[]>
  /** Directory for artifacts of one run. */
  artifactDir(runId: string): string
}

/**
 * Secret values. Executions never contain them. Configs hold `{ "$secret": key }`.
 * @category Services
 */
export interface SecretsProvider {
  /** Resolve one key. */
  get(key: string): Promise<string | undefined>
  /** Set one key. CLI only. */
  set(key: string, value: string): Promise<void>
  /** Delete one key. Returns whether it existed. */
  delete(key: string): Promise<boolean>
  /** Key names only. */
  list(): Promise<string[]>
}

/**
 * Evaluates `expr` and `$expr` in a sandbox.
 * @category Services
 */
export interface ExpressionEngine extends Lifecycle {
  /**
   * Evaluate one function source. `control` requires a boolean.
   * Throws {@link ExpressionError}.
   */
  evaluate(source: string, state: unknown, kind: "control" | "value"): Promise<unknown>
}

/**
 * Renders a retrieve or execute payload as text.
 * @category Services
 */
export interface Formatter {
  /** Media type of {@link Formatter.format}. */
  readonly mediaType: string
  /** Render a JSON value. */
  format(value: unknown): string
}

/**
 * A network or in-process surface the host exposes.
 * @category Services
 */
export interface Endpoint extends Lifecycle {
  /** Bound URL, once listening. */
  readonly url?: string
}

/**
 * Caller authentication. The MVP implementation checks the local token.
 * @category Services
 */
export interface Auth {
  /** `local` when the request is allowed. */
  authenticate(request: { headers: Record<string, string | undefined> }): Promise<{ principal: "local" } | undefined>
}

/**
 * Settings passed to `environment.start`. Numeric fields fall back to the MVP
 * defaults when omitted: step timeout 600000 ms, concurrency 4, expression
 * timeout 50 ms, 32 MiB memory, 1 MiB result.
 * @category Services
 */
export interface HostSettings {
  /** `ECP_HOME`. */
  home: string
  /** `server` listens; `in-process` does not. Default `in-process`. */
  mode?: "server" | "in-process"
  /** Capability timeout when the manifest does not set one. Default 600000. */
  defaultStepTimeoutMs?: number
  /** Default parallel concurrency. Default 4. */
  defaultMaxConcurrency?: number
  /** QuickJS limits. */
  expression?: {
    /** Evaluation budget in milliseconds. Default 50. */
    timeoutMs: number
    /** Memory limit in bytes. Default 32 MiB. */
    memoryBytes: number
    /** Maximum JSON result size in bytes. Default 1 MiB. */
    maxResultBytes: number
  }
  /** Extra plugin roots for tests. */
  extraPlugins?: string[]
  /** Log level. */
  logLevel?: "debug" | "info" | "warn" | "error"
}

/**
 * Stat for one editor schema file on disk.
 * @category Services
 */
export interface EditorSchemaFileStat {
  /** `"root"` or the plugin id. */
  id: string
  /** Absolute path on the host machine. */
  path: string
  /** File size in bytes. */
  bytes: number
}

/**
 * Host-written editor schema files under `$ECP_HOME/schema`.
 * @category Services
 */
export interface EditorSchemaFiles {
  /** Await the host startup editor write (no-op when already settled). */
  ensureCurrent(): Promise<void>
  /**
   * Stat the root editor schema when `pluginId` is omitted; otherwise stat that plugin's editor file.
   * Throws when the path is still missing after {@link ensureCurrent}.
   */
  stat(pluginId?: string): Promise<EditorSchemaFileStat>
  /** Read and parse JSON at `absolutePath` (from {@link stat}). */
  read(absolutePath: string): Promise<Record<string, unknown>>
}

/** Token for {@link PluginAdapter}. @category Services */
export const PluginAdapter: ServiceToken<PluginAdapter> = {
  id: "@executioncontrolprotocol/plugin-adapter",
  multiple: false,
}

/** Token for {@link EditorSchemaFiles}. @category Services */
export const EditorSchemaFiles: ServiceToken<EditorSchemaFiles> = {
  id: "@executioncontrolprotocol/editor-schema-files",
  multiple: false,
}

/** Token for {@link StorageProvider}. @category Services */
export const StorageProvider: ServiceToken<StorageProvider> = {
  id: "@executioncontrolprotocol/storage",
  multiple: false,
}

/** Token for {@link SecretsProvider}. @category Services */
export const SecretsProvider: ServiceToken<SecretsProvider> = {
  id: "@executioncontrolprotocol/secrets",
  multiple: false,
}

/** Token for {@link ExpressionEngine}. @category Services */
export const ExpressionEngine: ServiceToken<ExpressionEngine> = {
  id: "@executioncontrolprotocol/expression-engine",
  multiple: false,
}

/** Token for {@link Formatter}. Multiple formatters may be registered. @category Services */
export const Formatter: ServiceToken<Formatter> = {
  id: "@executioncontrolprotocol/formatter",
  multiple: true,
}

/** Token for {@link Endpoint}. @category Services */
export const Endpoint: ServiceToken<Endpoint> = {
  id: "@executioncontrolprotocol/endpoint",
  multiple: true,
}

/** Token for {@link Auth}. @category Services */
export const Auth: ServiceToken<Auth> = {
  id: "@executioncontrolprotocol/auth",
  multiple: false,
}

/**
 * Implementation ids of the MVP service classes. The class id is not the token id.
 * @category Services
 */
export const IMPLEMENTATION_IDS = {
  localPlugins: "@executioncontrolprotocol/local.plugins",
  localStorage: "@executioncontrolprotocol/local.storage",
  localSecrets: "@executioncontrolprotocol/local.secrets",
  quickjs: "@executioncontrolprotocol/quickjs",
  jsonFormatter: "@executioncontrolprotocol/formatters.json",
  toonFormatter: "@executioncontrolprotocol/formatters.toon",
  httpEndpoint: "@executioncontrolprotocol/host.http",
  localTokenAuth: "@executioncontrolprotocol/host.token",
  editorSchemaFiles: "@executioncontrolprotocol/host.editor-schema-files",
} as const
