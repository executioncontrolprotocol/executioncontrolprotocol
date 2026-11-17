/**
 * Host health payload from `GET /v1/health`.
 * @category Host
 */
export interface HostHealth {
  /** Lifecycle status. */
  status: "starting" | "ok" | "draining"
  /** Host package version. */
  version: string
  /** Host process id. */
  pid: number
  /** ISO start time. */
  startedAt: string
  /** Plugin count. */
  plugins: number
  /** Active running runs. */
  activeRuns: number
  /** ISO time of last counted activity. */
  lastActivityAt?: string
  /** Open `GET /v1/watch` streams. */
  openStreams?: number
}

/**
 * `GET /v1/health` against a base URL. Returns `undefined` on connection failure.
 * @category Host
 */
export async function checkHealth(baseUrl: string): Promise<HostHealth | undefined> {
  try {
    const response = await fetch(new URL("/v1/health", baseUrl))
    return (await response.json()) as HostHealth
  } catch {
    return undefined
  }
}

/**
 * Host header value for a loopback base URL.
 * @category Host
 */
export function hostHeaderFor(baseUrl: string): string {
  return new URL(baseUrl).host
}
