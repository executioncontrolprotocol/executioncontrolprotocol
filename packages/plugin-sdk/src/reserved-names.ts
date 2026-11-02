/**
 * Root command names plugins cannot use as oclif topics.
 * @category CLI
 */
export const RESERVED_ROOT_NAMES = [
  "run",
  "workflows",
  "runs",
  "environments",
  "plugins",
  "plugin",
  "config",
  "mcp",
  "app",
  "help",
] as const

/**
 * Flag names that stay input-only when they appear on a capability schema.
 * @category CLI
 */
export const RESERVED_FLAG_NAMES = ["json", "input", "help", "yes"] as const

/**
 * True when `topic` is reserved and cannot be a plugin command topic.
 * @category CLI
 */
export function isReservedRootName(topic: string): boolean {
  return (RESERVED_ROOT_NAMES as readonly string[]).includes(topic)
}
