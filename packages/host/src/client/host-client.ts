import type {
  CommitData,
  CommitInput,
  ExecuteData,
  ExecuteInput,
  OperationResponse,
  RetrieveData,
  RetrieveInput,
} from "@executioncontrolprotocol/protocol"

/**
 * Typed HTTP client for the three host operations.
 * @category Host
 */
export class HostClient {
  /**
   * @param baseUrl Host base URL (`http://127.0.0.1:<port>`).
   * @param token Bearer token from `host.json`.
   */
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {}

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

  /** `POST /v1/admin/drain`. */
  drain(timeoutMs = 30_000): Promise<OperationResponse<{ interrupted: string[] }>> {
    return this.post("/v1/admin/drain", { timeoutMs })
  }

  /** `POST /v1/admin/shutdown`. */
  shutdown(): Promise<OperationResponse<Record<string, never>>> {
    return this.post("/v1/admin/shutdown", {})
  }

  private async post<T>(pathName: string, body: unknown): Promise<OperationResponse<T>> {
    const response = await fetch(new URL(pathName, this.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    })
    return (await response.json()) as OperationResponse<T>
  }
}
