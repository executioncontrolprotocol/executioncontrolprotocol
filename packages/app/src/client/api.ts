import type {
  CommitData,
  CommitInput,
  ExecuteData,
  ExecuteInput,
  OperationError,
  OperationResponse,
  RetrieveData,
  RetrieveInput,
} from "@executioncontrolprotocol/protocol"

/**
 * `fetch` signature the App client depends on (injectable for tests).
 * @category App
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const UNAUTHORIZED_CODE = "ECP_UNAUTHORIZED"
const HOST_UNAVAILABLE_CODE = "ECP_HOST_UNAVAILABLE"
const INTERNAL_CODE = "ECP_INTERNAL"
const HTTP_UNAUTHORIZED = 401
const JSON_CONTENT_TYPE = "application/json; charset=utf-8"

/**
 * Thrown when the host rejects the token (HTTP 401). The App shows its unauthorised screen.
 * @category App
 */
export class UnauthorizedError extends Error {
  /** Always `ECP_UNAUTHORIZED`. */
  readonly code = UNAUTHORIZED_CODE

  /** @param message Host message, when it sent one. */
  constructor(message = "The host rejected the token.") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Thrown by the file routes and on network failures: carries the host's refusal.
 * @category App
 */
export class HostRequestError extends Error {
  /** Catalogue code (`ECP_NOT_FOUND`, `ECP_HOST_UNAVAILABLE`, …). */
  readonly code: string
  /** HTTP status, or 0 when the host could not be reached. */
  readonly status: number
  /** Full refusal. */
  readonly error: OperationError

  /**
   * @param error Refusal from the host (or synthesised for network failures).
   * @param status HTTP status, 0 when there was no response.
   */
  constructor(error: OperationError, status: number) {
    super(error.message)
    this.name = "HostRequestError"
    this.code = error.code
    this.status = status
    this.error = error
  }
}

/**
 * True when `value` has the `{ ok, data }` / `{ ok: false, error }` envelope shape.
 * @category App
 */
export function isOperationResponse(value: unknown): value is OperationResponse<unknown> {
  if (value === null || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (record.ok === true) return "data" in record
  if (record.ok === false) {
    const error = record.error as Record<string, unknown> | undefined
    return error !== null && typeof error === "object" && typeof error.code === "string"
  }
  return false
}

/**
 * Turn an HTTP status and parsed body into an operation envelope. 401 throws
 * {@link UnauthorizedError}; a body that is not an envelope becomes an `ECP_INTERNAL` refusal.
 * @category App
 */
export function toOperationResponse<T>(status: number, body: unknown): OperationResponse<T> {
  if (status === HTTP_UNAUTHORIZED) throw unauthorizedFrom(body)
  if (isOperationResponse(body)) return body as OperationResponse<T>
  return {
    ok: false,
    error: { code: INTERNAL_CODE, message: `The host answered HTTP ${status} without an operation envelope.` },
  }
}

function unauthorizedFrom(body: unknown): UnauthorizedError {
  return new UnauthorizedError(isOperationResponse(body) && !body.ok ? body.error.message : undefined)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function unavailable(error: unknown): HostRequestError {
  const reason = error instanceof Error ? error.message : String(error)
  return new HostRequestError(
    {
      code: HOST_UNAVAILABLE_CODE,
      message: `The host could not be reached: ${reason}`,
      suggestions: ["Start the host with `ecp host start`, then reload the App."],
    },
    0,
  )
}

/**
 * Options for the watch stream URL ({@link AppHostClient.watchUrl}).
 * @category App
 */
export interface WatchUrlOptions {
  /** Storage collections to stream (`run`, `execution`, `config`). Host default: all three. */
  types?: Array<"run" | "execution" | "config">
  /** Only stream run changes for this run id. */
  runId?: string
  /** Absolute `.ecp.json` path to watch (with its `$script.path` files). */
  path?: string
}

/**
 * Options for {@link AppHostClient}.
 * @category App
 */
export interface AppHostClientOptions {
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** Called before {@link UnauthorizedError} is thrown, so the App can switch screens. */
  onUnauthorized?: () => void
}

/**
 * Browser client for the host HTTP API: the three operations plus the App's file routes.
 * Every request carries `Authorization: Bearer <token>`.
 * @category App
 */
export class AppHostClient {
  /** `fetch` used for every request (also by the watch stream). */
  readonly fetch: FetchLike
  private readonly onUnauthorized: (() => void) | undefined

  /**
   * @param baseUrl Host origin (`window.location.origin` in the App).
   * @param token Host bearer token.
   * @param options {@link AppHostClientOptions}.
   */
  constructor(
    readonly baseUrl: string,
    readonly token: string,
    options: AppHostClientOptions = {},
  ) {
    this.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
    this.onUnauthorized = options.onUnauthorized
  }

  /** `POST /v1/retrieve`. */
  retrieve(input: RetrieveInput): Promise<OperationResponse<RetrieveData>> {
    return this.post("/v1/retrieve", input)
  }

  /** `POST /v1/execute`. */
  execute(input: ExecuteInput): Promise<OperationResponse<ExecuteData>> {
    return this.post("/v1/execute", input)
  }

  /** `POST /v1/commit`. */
  commit(input: CommitInput): Promise<OperationResponse<CommitData>> {
    return this.post("/v1/commit", input)
  }

  /** `PUT /v1/file?path=`: replace an open `.ecp.json` file (must be on the App watch set). */
  async putFile(path: string, text: string): Promise<void> {
    const response = await this.send(`/v1/file?${new URLSearchParams({ path })}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: text,
    })
    if (response.status === 204) return
    const body = await response.text()
    throw this.refusal(response.status, body)
  }

  /** `GET /v1/file?path=`: text of an execution file or one of its `$script.path` files. */
  async getFile(path: string): Promise<string> {
    const response = await this.send(`/v1/file?${new URLSearchParams({ path })}`, { method: "GET" })
    const text = await response.text()
    if (response.ok) return text
    throw this.refusal(response.status, text)
  }

  /** `GET /v1/files?dir=`: absolute `*.ecp.json` paths under `dir`. */
  async listFiles(dir: string): Promise<string[]> {
    const response = await this.send(`/v1/files?${new URLSearchParams({ dir })}`, { method: "GET" })
    const text = await response.text()
    const envelope = toOperationResponse<{ files?: unknown }>(response.status, parseJson(text))
    if (!envelope.ok) throw new HostRequestError(envelope.error, response.status)
    const files = envelope.data.files
    return Array.isArray(files) ? files.filter((file): file is string => typeof file === "string") : []
  }

  /** Absolute URL of `GET /v1/runs/:runId/artifacts/:name`. */
  artifactPath(runId: string, name: string): string {
    return this.url(
      `/v1/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`,
    )
  }

  /** Download one run artifact with local-token auth. */
  async fetchArtifact(runId: string, name: string): Promise<Blob> {
    const response = await this.send(
      `/v1/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`,
      { method: "GET" },
    )
    if (!response.ok) {
      const text = await response.text()
      throw this.refusal(response.status, text)
    }
    return await response.blob()
  }

  /** Absolute URL of the `/v1/watch` server-sent events stream. */
  watchUrl(options: WatchUrlOptions = {}): string {
    const params = new URLSearchParams()
    if (options.types && options.types.length > 0) params.set("types", options.types.join(","))
    if (options.runId) params.set("runId", options.runId)
    if (options.path) params.set("path", options.path)
    const query = params.toString()
    return this.url(`/v1/watch${query ? `?${query}` : ""}`)
  }

  private url(pathName: string): string {
    return new URL(pathName, this.baseUrl).toString()
  }

  private async send(pathName: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetch(this.url(pathName), {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${this.token}` },
      })
    } catch (error) {
      throw unavailable(error)
    }
    if (response.status === HTTP_UNAUTHORIZED) {
      this.onUnauthorized?.()
      throw unauthorizedFrom(parseJson(await response.text()))
    }
    return response
  }

  private refusal(status: number, text: string): HostRequestError {
    const envelope = toOperationResponse<unknown>(status, parseJson(text))
    if (!envelope.ok) return new HostRequestError(envelope.error, status)
    return new HostRequestError({ code: INTERNAL_CODE, message: `Unexpected HTTP ${status}.` }, status)
  }

  private async post<T>(pathName: string, body: unknown): Promise<OperationResponse<T>> {
    const response = await this.send(pathName, {
      method: "POST",
      headers: { "Content-Type": JSON_CONTENT_TYPE },
      body: JSON.stringify(body),
    })
    return toOperationResponse<T>(response.status, parseJson(await response.text()))
  }
}
