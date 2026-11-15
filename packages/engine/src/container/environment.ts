import type {
  CommitData,
  CommitInput,
  ExecuteData,
  ExecuteInput,
  HostSettings,
  OperationResponse,
  RetrieveData,
  RetrieveInput,
  ServiceToken,
} from "@executioncontrolprotocol/protocol"
import {
  DEFAULT_EXPR_MAX_RESULT_BYTES,
  DEFAULT_EXPR_MEMORY_BYTES,
  DEFAULT_EXPR_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_STEP_TIMEOUT_MS,
  ServiceError,
} from "./constants.js"
import { createOperations } from "../operations/operations.js"

/**
 * Structured log used by services. The host supplies the implementation.
 * @category Services
 */
export interface Logger {
  /** Debug. */
  debug(message: string, detail?: unknown): void
  /** Info. */
  info(message: string, detail?: unknown): void
  /** Warning. */
  warn(message: string, detail?: unknown): void
  /** Error. */
  error(message: string, detail?: unknown): void
}

/**
 * Lookup of constructed services. Calling it from a constructor or `start`
 * throws {@link ServiceError} `ECP_SERVICE_LOOKUP_TOO_EARLY`.
 * @category Services
 */
export interface ServiceLookup {
  /** The only implementation, the default, or the one with `id`. */
  get<T>(token: ServiceToken<T>, id?: string): T
  /** Every implementation of `token`, in registration order. */
  getAll<T>(token: ServiceToken<T>): T[]
  /** Whether an implementation is registered. */
  has<T>(token: ServiceToken<T>, id?: string): boolean
}

/**
 * Passed to every service constructor.
 * @category Services
 */
export interface ServiceContext {
  /** Other services. Use only from methods, not from the constructor or `start`. */
  readonly services: ServiceLookup
  /** `UseOptions.options` for this registration. */
  readonly options: unknown
  /** Host settings, with defaults filled in. */
  readonly settings: ResolvedHostSettings
  /** Logger. */
  readonly logger: Logger
}

/**
 * A service class. `id` is the implementation id, not the token id.
 * @category Services
 */
export interface ServiceClass<T> {
  /** Implementation id. */
  readonly id: string
  /** Construct from the service context. */
  new (ctx: ServiceContext): T
}

/**
 * Options for {@link Environment.use}.
 * @category Services
 */
export interface UseOptions {
  /** When a token has several implementations, `get` without an id returns this one. */
  default?: boolean
  /** Passed through as `ctx.options`. */
  options?: unknown
}

/**
 * Host settings after defaults are applied.
 * @category Services
 */
export interface ResolvedHostSettings {
  /** `ECP_HOME`. */
  home: string
  /** `server` or `in-process`. */
  mode: "server" | "in-process"
  /** Capability timeout default. */
  defaultStepTimeoutMs: number
  /** Parallel concurrency default. */
  defaultMaxConcurrency: number
  /** Expression limits. */
  expression: { timeoutMs: number; memoryBytes: number; maxResultBytes: number }
  /** Extra plugin roots. */
  extraPlugins: string[]
  /** Log level. */
  logLevel: "debug" | "info" | "warn" | "error"
  /** Write `output.path` files. Injected by the host. */
  writeTextFile?: (path: string, text: string) => Promise<void>
}

/**
 * In-process operations. The implementations land with the executor.
 * @category Operations
 */
export interface Operations {
  /** Read one object or a list. */
  retrieve(input: RetrieveInput): Promise<OperationResponse<RetrieveData>>
  /** Validate or run an execution. */
  execute(input: ExecuteInput): Promise<OperationResponse<ExecuteData>>
  /** Create, update or delete an execution or config. */
  commit(input: CommitInput): Promise<OperationResponse<CommitData>>
}

/**
 * A started host.
 * @category Services
 */
export interface Host {
  /** Constructed services. */
  readonly services: ServiceLookup
  /** In-process operations. */
  readonly operations: Operations
  /** Settings with defaults filled in. */
  readonly settings: ResolvedHostSettings
  /** Stop services in reverse registration order. */
  stop(): Promise<void>
}

/**
 * Registers service implementations and starts them.
 * @category Services
 */
export interface Environment {
  /** Register `impl` for `token`. */
  use<T>(impl: ServiceClass<T>, token: ServiceToken<T>, options?: UseOptions): Environment
  /** Construct every service, then `start` them in registration order. */
  start(settings: HostSettings): Promise<Host>
}

interface Registration {
  impl: ServiceClass<unknown>
  token: ServiceToken<unknown>
  options: UseOptions
  instance?: unknown
}

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

/**
 * Fill the MVP defaults for omitted host settings.
 * @category Services
 */
export function resolveHostSettings(settings: HostSettings & { writeTextFile?: (path: string, text: string) => Promise<void> }): ResolvedHostSettings {
  return {
    home: settings.home,
    mode: settings.mode ?? "in-process",
    defaultStepTimeoutMs: settings.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    defaultMaxConcurrency: settings.defaultMaxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    expression: {
      timeoutMs: settings.expression?.timeoutMs ?? DEFAULT_EXPR_TIMEOUT_MS,
      memoryBytes: settings.expression?.memoryBytes ?? DEFAULT_EXPR_MEMORY_BYTES,
      maxResultBytes: settings.expression?.maxResultBytes ?? DEFAULT_EXPR_MAX_RESULT_BYTES,
    },
    extraPlugins: settings.extraPlugins ?? [],
    logLevel: settings.logLevel ?? "info",
    writeTextFile: settings.writeTextFile,
  }
}

/**
 * Create a service token. Prefer the tokens exported by `protocol` for the MVP services.
 * @category Services
 */
export function defineService<T>(id: `@${string}/${string}`, options?: { multiple?: boolean }): ServiceToken<T> {
  return { id, multiple: options?.multiple ?? false }
}

/**
 * Operations throw until the executor is wired. The message says so.
 * @category Operations
 */
export function unimplementedOperations(): Operations {
  const fail = (name: string): Promise<never> =>
    Promise.reject(new ServiceError("ECP_INTERNAL", `${name} is not implemented yet. The executor lands later in Phase 1.`))
  return {
    retrieve: () => fail("retrieve"),
    execute: () => fail("execute"),
    commit: () => fail("commit"),
  }
}

/**
 * An empty environment. Register services with {@link Environment.use}, then {@link Environment.start}.
 * @category Services
 */
export function createEnvironment(): Environment {
  const registrations: Registration[] = []
  let started = false

  const environment: Environment = {
    use(impl, token, options) {
      if (started) {
        throw new ServiceError("ECP_SERVICE_DUPLICATE", "This environment has already been started.")
      }
      const same = registrations.filter((row) => row.token.id === token.id)
      if (!token.multiple && same.length > 0) {
        throw new ServiceError(
          "ECP_SERVICE_DUPLICATE",
          `${token.id} does not allow multiple implementations. ${same[0]?.impl.id ?? "unknown"} is already registered.`,
        )
      }
      if (options?.default === true && same.some((row) => row.options.default === true)) {
        const previous = same.find((row) => row.options.default === true)
        throw new ServiceError(
          "ECP_SERVICE_DUPLICATE",
          `Two defaults for ${token.id}: ${previous?.impl.id ?? "unknown"} and ${impl.id}.`,
        )
      }
      registrations.push({ impl: impl as ServiceClass<unknown>, token: token as ServiceToken<unknown>, options: options ?? {} })
      return environment
    },
    async start(settings) {
      if (started) {
        throw new ServiceError("ECP_SERVICE_DUPLICATE", "This environment has already been started.")
      }
      started = true
      const resolved = resolveHostSettings(settings)
      let phase: "construct" | "start" | "ready" = "construct"
      const lookup = createLookup(registrations, () => phase)
      const ctxFor = (options: unknown): ServiceContext => ({
        services: lookup,
        options,
        settings: resolved,
        logger: silentLogger,
      })
      for (const row of registrations) {
        row.instance = new row.impl(ctxFor(row.options.options))
      }
      phase = "start"
      for (const row of registrations) {
        const start = (row.instance as { start?: () => Promise<void> }).start
        if (start) await start.call(row.instance)
      }
      phase = "ready"
      return {
        services: lookup,
        operations: createOperations(lookup, {
          settings: resolved,
          writeTextFile: resolved.writeTextFile,
        }),
        settings: resolved,
        async stop() {
          const errors: unknown[] = []
          for (const row of [...registrations].reverse()) {
            const stop = (row.instance as { stop?: () => Promise<void> } | undefined)?.stop
            if (!stop) continue
            try {
              await stop.call(row.instance)
            } catch (error) {
              errors.push(error)
            }
          }
          if (errors.length > 0) throw errors[0]
        },
      }
    },
  }
  return environment
}

function createLookup(registrations: Registration[], phase: () => "construct" | "start" | "ready"): ServiceLookup {
  function assertReady(): void {
    if (phase() !== "ready") {
      throw new ServiceError(
        "ECP_SERVICE_LOOKUP_TOO_EARLY",
        "Services cannot look up other services from a constructor or start(). Look up from a method that runs after the host has started.",
      )
    }
  }
  function rows(token: ServiceToken<unknown>): Registration[] {
    return registrations.filter((row) => row.token.id === token.id)
  }
  return {
    get<T>(token: ServiceToken<T>, id?: string): T {
      assertReady()
      const matches = rows(token as ServiceToken<unknown>)
      if (id !== undefined) {
        const found = matches.find((row) => row.impl.id === id)
        if (!found?.instance) {
          throw new ServiceError("ECP_SERVICE_MISSING", missingMessage(token.id, matches, id))
        }
        return found.instance as T
      }
      if (matches.length === 0) {
        throw new ServiceError("ECP_SERVICE_MISSING", missingMessage(token.id, matches))
      }
      if (matches.length === 1) {
        const only = matches[0]
        if (!only?.instance) throw new ServiceError("ECP_SERVICE_MISSING", missingMessage(token.id, matches))
        return only.instance as T
      }
      const defaults = matches.filter((row) => row.options.default === true)
      const chosen = defaults[0]
      if (defaults.length === 1 && chosen?.instance) return chosen.instance as T
      throw new ServiceError(
        "ECP_SERVICE_AMBIGUOUS",
        `More than one ${token.id} is registered and none is the default. Pass an implementation id.`,
      )
    },
    getAll<T>(token: ServiceToken<T>): T[] {
      assertReady()
      return rows(token as ServiceToken<unknown>).map((row) => row.instance as T)
    },
    has(token, id) {
      assertReady()
      const matches = rows(token as ServiceToken<unknown>)
      if (id === undefined) return matches.length > 0
      return matches.some((row) => row.impl.id === id)
    },
  }
}

function missingMessage(tokenId: string, matches: Registration[], id?: string): string {
  const known = matches.map((row) => row.impl.id)
  const knownText = known.length === 0 ? "(none)" : known.join(", ")
  if (id === undefined) return `No ${tokenId} is registered. Known implementations: ${knownText}.`
  return `No ${tokenId} implementation ${id} is registered. Known implementations: ${knownText}.`
}
