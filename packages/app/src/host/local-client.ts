import type {
  EnvironmentDescriptor,
  PublicRunEvent,
  SearchResultItem,
  ValidationResult,
} from "@executioncontrolprotocol/core/types"
import type { HostAdapter, HostLoadResult, HostWatchPayload } from "./adapter.js"
import { APP_BEARER_PREFIX, APP_TOKEN_QUERY } from "./constants.js"
import type {
  AppEventMessage,
  AppRunRequest,
  AppRunResponse,
  AppSearchResponse,
  AppSourceResponse,
  AppSourceWrite,
} from "./protocol.js"

/**
 * Transport used by {@link createLocalHostAdapter}. Tests inject mocks.
 * @category App
 */
export interface LocalHostTransport {
  /** JSON GET. */
  get<T>(path: string): Promise<T>
  /** JSON PUT. */
  put(path: string, body: unknown): Promise<void>
  /** JSON POST. */
  post<T>(path: string, body: unknown): Promise<T>
  /** Subscribe to `/api/events`. */
  subscribe(onMessage: (message: AppEventMessage) => void): () => void
}

/**
 * Options for the local HTTP/WS adapter.
 * @category App
 */
export interface LocalHostAdapterOptions {
  /** Origin of the plugin-app server (`http://127.0.0.1:<port>`). */
  baseUrl: string
  /** Pairing token from the URL. Never logged. */
  token: string
  /** Override `fetch` (tests). */
  fetchImpl?: typeof fetch
  /** Injected transport (tests). When set, `baseUrl` / `token` are unused. */
  transport?: LocalHostTransport
}

function joinUrl(baseUrl: string, path: string, token: string): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
  url.searchParams.set(APP_TOKEN_QUERY, token)
  return url.toString()
}

function createFetchTransport(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch
): LocalHostTransport {
  const headers = {
    Accept: "application/json",
    Authorization: `${APP_BEARER_PREFIX}${token}`,
    "Content-Type": "application/json",
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetchImpl(joinUrl(baseUrl, path, token), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`App host ${method} ${path} failed (${response.status}): ${text}`)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    get: (path) => request("GET", path),
    put: async (path, body) => {
      await request("PUT", path, body)
    },
    post: (path, body) => request("POST", path, body),
    subscribe(onMessage) {
      const wsUrl = joinUrl(baseUrl, "/api/events", token).replace(/^http/i, "ws")
      const socket = new WebSocket(wsUrl)
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return
        try {
          onMessage(JSON.parse(event.data) as AppEventMessage)
        } catch {
          // ignore malformed frames
        }
      })
      return () => socket.close()
    },
  }
}

/**
 * HostAdapter that talks to `plugin-app` over loopback HTTP and WebSocket.
 * @category App
 */
export function createLocalHostAdapter(options: LocalHostAdapterOptions): HostAdapter {
  const transport =
    options.transport ??
    createFetchTransport(
      options.baseUrl,
      options.token,
      options.fetchImpl ?? fetch
    )

  return {
    async load(): Promise<HostLoadResult> {
      const data = await transport.get<AppSourceResponse>("/api/source")
      if (data.loadError || !data.manifest || !data.requirements) {
        throw new Error(data.loadError?.errors[0]?.message ?? "Workflow failed to load")
      }
      return {
        path: data.path,
        source: data.source,
        manifest: data.manifest,
        requirements: data.requirements,
        roundTrip: data.roundTrip,
      }
    },
    async save(source: string): Promise<void> {
      const body: AppSourceWrite = { source }
      await transport.put("/api/source", body)
    },
    watch(onChange: (next: HostWatchPayload) => void): () => void {
      return transport.subscribe((message) => {
        if (message.type !== "file") return
        onChange({
          source: message.source,
          manifest: message.manifest,
          loadError: message.loadError,
          roundTrip: message.roundTrip,
        })
      })
    },
    describe(): Promise<EnvironmentDescriptor> {
      return transport.get<EnvironmentDescriptor>("/api/describe")
    },
    async search(query: string): Promise<SearchResultItem[]> {
      const path = `/api/search?q=${encodeURIComponent(query)}`
      const data = await transport.get<AppSearchResponse>(path)
      return data.results
    },
    validate(source: string): Promise<ValidationResult> {
      return transport.post<ValidationResult>("/api/validate", { source })
    },
    async *run(source: string, input: unknown): AsyncIterable<PublicRunEvent> {
      const buffer: PublicRunEvent[] = []
      let done = false
      let notify: (() => void) | undefined
      const unsubscribe = transport.subscribe((message) => {
        if (message.type !== "run") return
        buffer.push(message.event)
        if (message.event.type === "run.end") done = true
        notify?.()
      })
      const body: AppRunRequest = { source, input }
      await transport.post<AppRunResponse>("/api/run", body)
      try {
        while (!done || buffer.length > 0) {
          if (buffer.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve
            })
            notify = undefined
          }
          const next = buffer.shift()
          if (next) yield next
        }
      } finally {
        unsubscribe()
      }
    },
  }
}
