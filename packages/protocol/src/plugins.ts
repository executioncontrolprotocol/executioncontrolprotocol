/**
 * Opaque handle produced by resolving a `$state` marker.
 * @category Plugins
 */
export interface StateHandle {
  /** State path the handle writes. */
  readonly path: string
}

/**
 * Absolute file reference.
 * @category Plugins
 */
export interface FileRefFile {
  /** Discriminator. */
  kind: "file"
  /** Absolute path. */
  path: string
  /** Media type, when known. */
  mediaType?: string
}

/**
 * URL reference.
 * @category Plugins
 */
export interface FileRefUrl {
  /** Discriminator. */
  kind: "url"
  /** Absolute URL. */
  url: string
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Media type, when known. */
  mediaType?: string
}

/**
 * Artifact written into a run's artifact directory.
 * @category Plugins
 */
export interface ArtifactFileRef {
  /** Discriminator. */
  kind: "artifact"
  /** `ecp://runs/<runId>/artifacts/<name>`. */
  uri: string
  /** Media type. */
  mediaType?: string
  /** File name. */
  name?: string
  /** Size in bytes. */
  sizeBytes?: number
}

/**
 * File reference a handler can read. The legacy `buffer` kind is not part of v2.
 * @category Plugins
 */
export type FileRef = FileRefFile | FileRefUrl | ArtifactFileRef

/**
 * Bytes a handler read from a {@link FileRef}.
 * @category Plugins
 */
export interface FileBytes {
  /** File contents. */
  bytes: Uint8Array
  /** Media type, when known. */
  mediaType?: string
  /** File name, when known. */
  name?: string
}

/**
 * Values the host fills in before it builds a {@link HandlerContext}.
 * @category Plugins
 */
export interface HandlerContextInit {
  /** Run id. */
  runId: string
  /** Step id. */
  stepId: string
  /** Loop round, when the step is inside a loop. */
  round?: number
  /** State snapshot at step start. */
  state: Record<string, unknown>
}

/**
 * Staged writes. Applied only when the step succeeds.
 * @category Plugins
 */
export interface HandlerStore {
  /** Replace the value at the handle. */
  set(handle: StateHandle, value: unknown): void
  /** Merge an object into the value at the handle. */
  merge(handle: StateHandle, value: Record<string, unknown>): void
  /** Append a value to the array at the handle. */
  append(handle: StateHandle, value: unknown): void
}

/**
 * Context passed to a capability handler.
 * @category Plugins
 */
export interface HandlerContext<Config = Record<string, unknown> | undefined> {
  /** Resolved config, secrets in place. Undefined when the plugin has no config. */
  config: Config
  /** Aborted on cancel, timeout or a parallel sibling failure. */
  signal: AbortSignal
  /** Run identity. */
  run: { id: string }
  /** Step identity. */
  step: { id: string; round?: number }
  /** State snapshot at step start. Handlers must not mutate it. */
  state: Readonly<Record<string, unknown>>
  /** Staged writes for `$state` handles. */
  store: HandlerStore
  /** Read refs and write artifacts. */
  files: {
    /** Read a file, URL or artifact ref. */
    read(ref: FileRef): Promise<FileBytes>
    /** Write bytes into the run artifact directory. */
    writeArtifact(bytes: Uint8Array, options: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
  }
  /** Call another capability through the host. Counts as a nested step. */
  call(capabilityId: string, input: unknown, options?: { config?: string }): Promise<unknown>
  /** Structured log. */
  logger: {
    /** Debug. */
    debug(message: string, detail?: unknown): void
    /** Info. */
    info(message: string, detail?: unknown): void
    /** Warning. */
    warn(message: string, detail?: unknown): void
    /** Error. */
    error(message: string, detail?: unknown): void
  }
  /** Record usage on the step. */
  usage: {
    /** Append one usage entry. */
    record(entry: { kind: string; amount: number; unit: string; detail?: unknown }): void
  }
}

/**
 * Capability handler. `C` is the plugin definition the SDK infers types from.
 * @category Plugins
 */
export type Handler<Input = unknown, Output = unknown, Config = Record<string, unknown> | undefined> = (
  input: Input,
  ctx: HandlerContext<Config>,
) => Promise<Output>

/**
 * One capability inside `ecp.manifest.json`.
 * @category Plugins
 */
export interface PluginCapabilityManifest {
  /** Capability id. */
  id: string
  /** Name segment after the dot. */
  name: string
  /** One-line summary. */
  summary: string
  /** Longer description. */
  description: string
  /** When to call it. */
  useCases: string[]
  /** What to take from the output. */
  projections: string[]
  /** JSON Schema for the input. */
  accepts: Record<string, unknown>
  /** JSON Schema for the output. */
  returns: Record<string, unknown>
  /** Step timeout in milliseconds. */
  timeoutMs?: number
}

/**
 * `ecp.manifest.json`.
 * @category Plugins
 */
export interface PluginManifest {
  /** Always `@executioncontrolprotocol.plugin-manifest`. */
  schema: "@executioncontrolprotocol.plugin-manifest"
  /** Always `1.0`. */
  version: "1.0"
  /** Plugin identity. */
  plugin: {
    /** Plugin id. */
    id: string
    /** npm package name. */
    package: string
    /** Must equal `package.json` version. */
    version: string
    /** One-line summary. */
    summary: string
    /** Longer description. */
    description: string
  }
  /** plugin-sdk version that generated the manifest. */
  sdkVersion: string
  /** Config schema, when the plugin declares config. */
  configSchema?: Record<string, unknown>
  /** Capabilities. */
  capabilities: PluginCapabilityManifest[]
  /** Module the host imports on first call. */
  entry: string
  /** SHA-256 of the canonical JSON of every field above `hash`. */
  hash: string
}
