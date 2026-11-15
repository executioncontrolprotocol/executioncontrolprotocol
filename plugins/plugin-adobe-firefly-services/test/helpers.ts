import { vi } from "vitest"
import type { ArtifactFileRef, HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

export const IMS_URL = "https://ims-na1.adobelogin.com/ims/token/v3"

export interface LoggedEntry {
  level: string
  message: string
  detail?: unknown
}

/** Handler context with the plugin's config and a log sink. */
export function makeCtx(
  config: Record<string, unknown> | undefined,
  partial: Partial<HandlerContext> = {},
): HandlerContext & { logs: LoggedEntry[] } {
  const logs: LoggedEntry[] = []
  const log = (level: string) => (message: string, detail?: unknown) => {
    logs.push({ level, message, detail })
  }
  return {
    logs,
    config,
    signal: new AbortController().signal,
    run: { id: "run-1" },
    step: { id: "step-1" },
    state: Object.freeze({}),
    store: { set() {}, merge() {}, append() {} },
    files: {
      async read() {
        return { bytes: new Uint8Array() }
      },
      async writeArtifact(): Promise<ArtifactFileRef> {
        return { kind: "artifact", uri: "ecp://runs/run-1/artifacts/x" }
      },
    },
    async call() {
      return undefined
    },
    logger: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
    usage: { record() {} },
    ...partial,
  }
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

export function tokenResponse(token = "token-1", expiresIn = 86_400): Response {
  return jsonResponse(200, { access_token: token, token_type: "bearer", expires_in: expiresIn })
}

export interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal | null
}

type Route = (call: RecordedCall, init: RequestInit) => Response | Promise<Response>

/**
 * Stub global fetch. IMS token requests get a token unless `ims` is given; every other call
 * goes to `route`. Calls (except IMS) are recorded with parsed JSON bodies.
 */
export function stubFetch(route: Route, ims: () => Response | Promise<Response> = () => tokenResponse()) {
  const calls: RecordedCall[] = []
  const imsCalls: string[] = []
  const mock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    if (url === IMS_URL) {
      imsCalls.push(String(init.body))
      return ims()
    }
    const headers = (init.headers ?? {}) as Record<string, string>
    const call: RecordedCall = {
      url,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      signal: init.signal,
    }
    calls.push(call)
    return route(call, init)
  })
  vi.stubGlobal("fetch", mock)
  return { mock, calls, imsCalls }
}

/** A fetch that never settles until its signal aborts. */
export function hangUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init.signal
    if (!signal) return
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })
}

export const CONFIG = { clientId: "client-id", clientSecret: "client-secret", pollIntervalMs: 1 }
