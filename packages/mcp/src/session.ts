import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Mutable host used by tool and resource handlers so plugin installs can
 * rebuild the registry without dropping the MCP connection.
 * @category MCP
 */
export interface McpSessionState {
  /** Live process host. */
  host: EcpHost
  /** Close the dataDir watcher, if one is running. */
  closeWatch?: () => void
}
