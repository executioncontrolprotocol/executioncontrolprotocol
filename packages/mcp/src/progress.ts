import type { PublicRunEvent } from "@executioncontrolprotocol/core/types"

/**
 * Subset of the MCP tool extra bag used to emit progress notifications.
 * @category MCP
 */
export interface McpProgressSink {
  /** Request metadata; `progressToken` is set when the client asked for progress. */
  _meta?: { progressToken?: string | number }
  /** Send a JSON-RPC notification associated with the current tool call. */
  sendNotification: (notification: {
    method: "notifications/progress"
    params: {
      progressToken: string | number
      progress: number
      message?: string
    }
  }) => Promise<void>
}

/**
 * Map `ecp run --events` onto MCP progress notifications when the client
 * supplied a progress token.
 * @category MCP
 */
export function progressFromRunEvent(
  extra: McpProgressSink,
  events: boolean | undefined
): ((event: PublicRunEvent) => void | Promise<void>) | undefined {
  if (!events) return undefined
  const token = extra._meta?.progressToken
  if (token === undefined) return undefined
  let n = 0
  return async (event) => {
    n += 1
    await extra.sendNotification({
      method: "notifications/progress",
      params: {
        progressToken: token,
        progress: n,
        message: event.type,
      },
    })
  }
}
