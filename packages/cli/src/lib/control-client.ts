import type { HostFile, SupervisorStatus } from "@executioncontrolprotocol/protocol"

/**
 * Thin HTTP client for the supervisor control port.
 * @category CLI
 */
export class ControlClient {
  /**
   * @param hostFile Active `host.json`.
   */
  constructor(private readonly hostFile: HostFile) {}

  /** `GET /status`. */
  async status(): Promise<SupervisorStatus> {
    return this.request<SupervisorStatus>("GET", "/status")
  }

  /** `POST /restart`. */
  async restart(force = false): Promise<void> {
    await this.request("POST", "/restart", { force })
  }

  /** `POST /stop`. */
  async stop(force = false): Promise<void> {
    await this.request("POST", "/stop", { force })
  }

  private async request<T = unknown>(method: string, pathName: string, body?: unknown): Promise<T> {
    const url = `http://127.0.0.1:${this.hostFile.controlPort}${pathName}`
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.hostFile.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      throw Object.assign(new Error(text || `Control ${method} ${pathName} failed (${response.status}).`), {
        code: response.status === 401 ? "ECP_UNAUTHORIZED" : "ECP_HOST_UNAVAILABLE",
      })
    }
    if (response.status === 204) return undefined as T
    const text = await response.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }
}
