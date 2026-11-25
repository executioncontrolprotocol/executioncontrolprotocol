# 07 — Services

## Container (in `engine`)

```ts
/** A typed token for a service interface. */
interface ServiceToken<T> { readonly id: string; readonly multiple: boolean; readonly __type?: T }
declare function defineService<T>(id: `@${string}/${string}`, options?: { multiple?: boolean }): ServiceToken<T>

/** An implementation class: static id, constructed with the service context. */
interface ServiceClass<T> { readonly id: string; new (ctx: ServiceContext): T }
interface Lifecycle { start?(): Promise<void>; stop?(): Promise<void> }

interface UseOptions { default?: boolean; options?: unknown }   // options are passed to the constructor via ctx.options

interface Environment {
  use<T>(impl: ServiceClass<T>, token: ServiceToken<T>, options?: UseOptions): Environment
  start(settings?: HostSettings): Promise<Host>
}
declare function createEnvironment(): Environment

interface ServiceLookup {
  get<T>(token: ServiceToken<T>, id?: string): T
  getAll<T>(token: ServiceToken<T>): T[]
  has<T>(token: ServiceToken<T>, id?: string): boolean
}
interface ServiceContext {
  services: ServiceLookup          // use only inside methods, never in constructor or start()
  options: unknown                 // UseOptions.options
  settings: HostSettings
  logger: Logger
}
interface Host {
  services: ServiceLookup
  operations: Operations           // retrieve/execute/commit in-process (06)
  settings: HostSettings
  stop(): Promise<void>
}
interface HostSettings {
  home: string                     // ECP_HOME
  defaultStepTimeoutMs: number     // 600000
  defaultMaxConcurrency: number    // 4
  expression: { timeoutMs: number; memoryBytes: number; maxResultBytes: number }   // 50, 32 MiB, 1 MiB
  files?: { maxBytes?: { bytes?: number; stream?: number; path?: number; url?: number; capture?: number } }   // default 512 MiB per method, capture 256 MiB
}
```

Rules (decided; tests required for each):

1. **Lookup by id, never ranking.** `get(token, id)` returns that implementation. `get(token)`
   with no id: the only one, or the one registered `{ default: true }`; otherwise
   `ECP_SERVICE_AMBIGUOUS`. Not registered → `ECP_SERVICE_MISSING` (message names the token and
   known implementation ids).
2. **Single services** (`multiple` false): a second `use` for the same token throws
   `ECP_SERVICE_DUPLICATE` at `use()` time. Two `{ default: true }` for one token throws too.
3. **No declared dependencies.** Construction order = registration order; `start()` is awaited
   in registration order; `stop()` in reverse. A service calling `services.get` from its
   constructor or `start()` throws `ECP_SERVICE_LOOKUP_TOO_EARLY` (the container enforces it).
4. **Ids:** service ids `@executioncontrolprotocol/<name>`; implementation ids are the npm
   package, or `<package>.<name>` when a package ships several.

(`ECP_SERVICE_*` codes are programmer errors: thrown, not operation errors. Add them to the
catalogue as internal codes.)

## MVP service interfaces (in `protocol`, as types) and implementations

| Token | Id | Multiple | MVP implementation (id) | Package |
| --- | --- | --- | --- | --- |
| `PluginAdapter` | `@executioncontrolprotocol/plugin-adapter` | no | `LocalPluginRegistration` (`@executioncontrolprotocol/local.plugins`) | `local` |
| `StorageProvider` | `@executioncontrolprotocol/storage` | no | `LocalStorage` (`@executioncontrolprotocol/local.storage`) | `local` |
| `ArtifactStore` | `@executioncontrolprotocol/artifact-store` | no | `LocalArtifactStore` (`@executioncontrolprotocol/local.artifact-store`) | `local` |
| `ScratchSpace` | `@executioncontrolprotocol/scratch-space` | no | `LocalScratchSpace` (`@executioncontrolprotocol/local.scratch-space`) | `local` |
| `SecretsProvider` | `@executioncontrolprotocol/secrets` | no | `LocalSecrets` (`@executioncontrolprotocol/local.secrets`) | `local` |
| `ExpressionEngine` | `@executioncontrolprotocol/expression-engine` | no | `QuickJsExpressionEngine` (`@executioncontrolprotocol/quickjs`) | `quickjs` |
| `Formatter` | `@executioncontrolprotocol/formatter` | yes | `JsonFormatter` (`…/formatters.json`, default), `ToonFormatter` (`…/formatters.toon`) | `formatters` |
| `Endpoint` | `@executioncontrolprotocol/endpoint` | yes | `HttpApiEndpoint` (`@executioncontrolprotocol/host.http`) | `host` |
| `Auth` | `@executioncontrolprotocol/auth` | no | `LocalTokenAuth` (`@executioncontrolprotocol/host.token`) | `host` |

```ts
interface PluginAdapter extends Lifecycle {
  capabilities(): CapabilityEntry[]                        // from manifests; never imports plugin code
  plugins(): PluginInfo[]
  configSchema(pluginId: string): JsonSchema | undefined
  call(request: CapabilityCall, signal: AbortSignal): Promise<unknown>   // imports plugin code on first call
}
interface CapabilityCall {
  capabilityId: string
  input: unknown                                           // resolved and validated
  config: Record<string, unknown> | undefined              // resolved (secrets included)
  context: HandlerContextInit                              // see 08
}

interface StorageProvider extends Lifecycle {
  getExecution(id: string): Promise<StoredExecution | undefined>
  listExecutions(): Promise<StoredExecutionSummary[]>
  putExecution(id: string, manifest: ExecutionManifest, opts: { ifVersion?: number; create?: boolean; warnings?: ValidationIssue[] }): Promise<{ version: number }>
  deleteExecution(id: string, ifVersion: number): Promise<void>
  getConfig(id: string): Promise<ConfigObject | undefined>
  listConfigs(plugin?: string): Promise<ConfigObject[]>
  putConfig(config: ConfigObject, opts: { ifVersion?: number; create?: boolean }): Promise<{ version: number }>
  deleteConfig(id: string, ifVersion: number): Promise<void>
  readExecutionFile(absolutePath: string): Promise<string>        // for { path } executions
  readTextFile(absolutePath: string): Promise<string>             // for $script.path
  runs: RunStore
  watch(listener: (change: StorageChange) => void): () => void
}
interface RunStore {
  create(record: RunRecord, manifest: ExecutionManifest): Promise<void>
  update(id: string, patch: Partial<RunRecord>): Promise<void>
  writeStep(runId: string, step: StepRecord): Promise<void>
  writeState(runId: string, state: unknown): Promise<void>
  appendEvent(runId: string, event: RunEvent): Promise<void>
  get(id: string, include?: Array<"steps" | "events" | "state">): Promise<RunDetail | undefined>
  getManifest(id: string): Promise<ExecutionManifest | undefined>
  list(filter: RunFilter, limit: number): Promise<RunRecord[]>
}

interface ArtifactStore extends Lifecycle {
  put(runId: string, name: string, body: ReadableStream<Uint8Array> | Uint8Array, options?: { mediaType?: string }): Promise<ArtifactFileRef>
  getStream(runId: string, name: string): Promise<ReadableStream<Uint8Array>>
  getBytes(runId: string, name: string): Promise<Uint8Array>
  stat(runId: string, name: string): Promise<{ name: string; sizeBytes: number; mediaType?: string } | undefined>
  list(runId: string): Promise<Array<{ name: string; sizeBytes: number; mediaType?: string }>>
  deleteRun(runId: string): Promise<void>
  uri(runId: string, name: string): string
}

interface ScratchSpace extends Lifecycle {
  writeBytes(runId: string, stepId: string, name: string, bytes: Uint8Array): Promise<string>
  copyFromPath(runId: string, stepId: string, sourcePath: string, name: string): Promise<string>
  releaseStep(runId: string, stepId: string): Promise<void>
}

type StorageChange = { type: "execution" | "config" | "run"; id: string; action: "put" | "delete" }

interface SecretsProvider {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>      // CLI only
  delete(key: string): Promise<boolean>
  list(): Promise<string[]>                          // keys only
}

interface ExpressionEngine extends Lifecycle {
  evaluate(source: string, state: unknown, kind: "control" | "value"): Promise<unknown>   // throws ExpressionError with code
}

interface Formatter {
  readonly mediaType: string
  format(value: unknown): string
}

interface Endpoint extends Lifecycle { readonly url?: string }

interface Auth {
  authenticate(request: { headers: Record<string, string | undefined> }): Promise<{ principal: "local" } | undefined>
}
```

## Host composition (in `host`)

```ts
const environment = createEnvironment()
  .use(LocalPluginRegistration, PluginAdapter)
  .use(LocalStorage, StorageProvider)
  .use(LocalSecrets, SecretsProvider)
  .use(QuickJsExpressionEngine, ExpressionEngine)
  .use(JsonFormatter, Formatter, { default: true })
  .use(ToonFormatter, Formatter)
  .use(LocalTokenAuth, Auth)
  .use(HttpApiEndpoint, Endpoint, { options: { port, token } })   // omitted in in-process CLI mode
const host = await environment.start(settings)
```

(`PluginAdapter` etc. are the token constants exported by `protocol`/`engine`; the table above
gives their ids.)

`host` exports `createLocalHost({ home, mode: "server" | "in-process", port?, token? })` that
performs exactly this composition; the CLI's in-process mode and the server entry both use it,
so the two modes can't diverge.
