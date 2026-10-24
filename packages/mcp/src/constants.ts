/** Maximum MCP tool name length accepted by Claude clients. @category MCP */
export const MCP_TOOL_NAME_MAX = 64

/** Hex characters appended when a sanitized name is truncated or collides. @category MCP */
export const MCP_TOOL_HASH_LENGTH = 6

/** JSON mime type used for ECP MCP resources. @category MCP */
export const JSON_MIME = "application/json"

/**
 * Closed set of meta tools always registered (unless a subset is requested).
 * @category MCP
 */
export const META_TOOL_NAMES = [
  "ecp_search",
  "ecp_describe",
  "ecp_validate",
  "ecp_run",
  "ecp_runs_show",
  "ecp_runs_rerun",
  "ecp_invoke",
  "ecp_plugins_install",
] as const

/** Meta tool name union. @category MCP */
export type MetaToolName = (typeof META_TOOL_NAMES)[number]

/** Default MCP server name. @category MCP */
export const DEFAULT_MCP_SERVER_NAME = "ecp"

/** Default MCP endpoint path for streamable HTTP. @category MCP */
export const DEFAULT_MCP_PATH = "/mcp"

/** Default HTTP bind address (loopback only). @category MCP */
export const DEFAULT_MCP_HOST = "127.0.0.1"

/** Default HTTP bind port. @category MCP */
export const DEFAULT_MCP_PORT = 3847

/** Debounce for oclif `dataDir/package.json` watches. @category MCP */
export const PLUGIN_MANIFEST_WATCH_MS = 100

/** Authorization scheme required on HTTP requests. @category MCP */
export const MCP_BEARER_PREFIX = "Bearer "
