/**
 * oclif JIT plugin map from the CLI package.json.
 * @category CLI
 */
export type JitPluginMap = Record<string, string>

/**
 * Package name in `oclif.jitPlugins` that owns `topic`, if any.
 * `mcp` maps to `@executioncontrolprotocol/mcp` (not `plugin-mcp`) so
 * command-not-found does not steal the JIT install path.
 * @category CLI
 */
export function jitPluginForTopic(topic: string, jitPlugins: JitPluginMap): string | undefined {
  if (!topic) return undefined
  const candidates = [
    `@executioncontrolprotocol/${topic}`,
    `@executioncontrolprotocol/plugin-${topic}`,
  ]
  for (const name of candidates) {
    if (name in jitPlugins) return name
  }
  for (const name of Object.keys(jitPlugins)) {
    const bare = name.split("/").pop() ?? ""
    if (bare === topic || bare === `plugin-${topic}`) return name
  }
  return undefined
}
