import type { Interfaces } from "@oclif/core"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/** Which MCP tools to register. @category MCP */
export type McpToolSet = "all" | "meta"

/**
 * Options for {@link createEcpMcpServer}.
 * @category MCP
 */
export interface CreateEcpMcpServerOptions {
  /** Process host (the same object the CLI `init` hook stores). */
  host: EcpHost
  /** Server name advertised to MCP clients. */
  name?: string
  /** Server version advertised to MCP clients. */
  version?: string
  /**
   * `all` registers meta tools plus one tool per capability.
   * `meta` registers only the closed meta set (`ecp_invoke` still reaches capabilities).
   */
  tools?: McpToolSet
  /** oclif config used by `ecp_plugins_install` and the dataDir watch. */
  config?: Interfaces.Config
  /** Override plugin install (tests). Defaults to `config.runCommand("plugins:install")`. */
  installPlugin?: (spec: string) => Promise<unknown>
  /**
   * Rebuild the host after the plugin manifest changes.
   * Defaults to `host.rebuild()` when the CLI init hook provided one.
   */
  rebuildHost?: () => Promise<EcpHost>
  /**
   * Directory whose `package.json` is watched for `list_changed`.
   * Defaults to `config.dataDir` when set.
   */
  watchDataDir?: string
  /** Called after a successful `ecp_plugins_install` so tests can hook refresh. */
  onPluginsChanged?: () => Promise<void>
}
