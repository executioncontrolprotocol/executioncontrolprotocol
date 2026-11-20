import type {
  ArtifactFileRef,
  FileBytes,
  FileRef,
  HandlerContext,
  HandlerContextInit,
  HandlerStore,
} from "@executioncontrolprotocol/protocol"

/**
 * Injected I/O and host services for {@link createHandlerContext}.
 * @category Environment
 */
export interface HandlerContextDeps {
  /** Read a file, URL or artifact ref. */
  readFile(ref: FileRef): Promise<FileBytes>
  /** Write bytes into the run artifact directory. */
  writeArtifact(bytes: Uint8Array, options: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
  /** Nested capability call through the host. */
  call(capabilityId: string, input: unknown, options?: { config?: string }): Promise<unknown>
  /** Host logger. */
  logger: HandlerContext["logger"]
  /** Record usage on the live step. */
  usage: HandlerContext["usage"]
}

/**
 * Deep-freeze a JSON value. Returns a readonly view.
 * @category Environment
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

/**
 * Build a {@link HandlerContext} for one capability call.
 * File and network I/O are injected so the engine stays free of Node imports.
 * @category Environment
 */
export function createHandlerContext<Config = Record<string, unknown> | undefined>(options: {
  /** Resolved config. */
  config: Config
  /** Abort signal for the step. */
  signal: AbortSignal
  /** Run/step identity and state snapshot. */
  init: HandlerContextInit
  /** Staged writes. */
  store: HandlerStore
  /** Injected host services. */
  deps: HandlerContextDeps
}): HandlerContext<Config> {
  return {
    config: options.config,
    signal: options.signal,
    run: { id: options.init.runId },
    step: {
      id: options.init.stepId,
      ...(options.init.round === undefined ? {} : { round: options.init.round }),
    },
    state: deepFreeze({ ...options.init.state }),
    store: options.store,
    files: {
      read: (ref) => options.deps.readFile(ref),
      writeArtifact: (bytes, writeOptions) => options.deps.writeArtifact(bytes, writeOptions),
    },
    call: (capabilityId, input, callOptions) => options.deps.call(capabilityId, input, callOptions),
    logger: options.deps.logger,
    usage: options.deps.usage,
    ...(options.init.expression === undefined ? {} : { expression: options.init.expression }),
  }
}
