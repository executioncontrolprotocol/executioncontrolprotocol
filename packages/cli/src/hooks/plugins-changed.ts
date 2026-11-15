import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Hook } from "@oclif/core"
import { ecpDataDir } from "../lib/home.js"

const PLUGIN_MUTATIONS = new Set([
  "plugins:install",
  "plugins:link",
  "plugins:uninstall",
  "plugins:update",
  "plugins install",
  "plugins link",
  "plugins uninstall",
  "plugins update",
])

/**
 * After plugin install/link/uninstall/update: warn on missing/invalid manifest and touch the change marker.
 * oclif plugin-plugins v5 does not emit plugins:post* hooks, so this runs from `finally`.
 * @category CLI
 */
const finallyHook: Hook<"finally"> = async function (options) {
  const id = options.id
  if (!id || !PLUGIN_MUTATIONS.has(id)) return
  if (options.error) return

  const roots = collectRoots(id, options.argv, options.config)
  for (const root of roots) {
    warnManifest(root, this.warn.bind(this))
  }
  touchMarker()
}

/**
 * Legacy hook name kept registered for older plugin-plugins builds.
 * @category CLI
 */
export async function pluginsPostHook(
  this: { warn: (message: string) => void },
  options: { plugin?: { root?: string }; config?: { plugins?: Array<{ root?: string }> } },
): Promise<void> {
  const roots = options.plugin?.root
    ? [options.plugin.root]
    : (options.config?.plugins ?? []).map((plugin) => plugin.root).filter((root): root is string => Boolean(root))
  for (const root of roots) warnManifest(root, this.warn.bind(this))
  touchMarker()
}

export default finallyHook

function collectRoots(
  id: string,
  argv: string[],
  config: { plugins?: Map<string, { root?: string; type?: string }> | Array<{ root?: string; type?: string }> },
): string[] {
  if (id.includes("link")) {
    const target = argv.find((arg) => !arg.startsWith("-"))
    if (target) return [path.resolve(target)]
  }
  const plugins = config.plugins
  if (!plugins) return []
  const list = plugins instanceof Map ? [...plugins.values()] : plugins
  return list
    .filter((plugin) => plugin.type === "user" || plugin.type === "link")
    .map((plugin) => plugin.root)
    .filter((root): root is string => Boolean(root))
}

function warnManifest(root: string, warn: (message: string) => void): void {
  const manifestPath = path.join(root, "ecp.manifest.json")
  if (!existsSync(manifestPath)) {
    warn(`Plugin at ${root} has no ecp.manifest.json; the host will not load its capabilities.`)
    return
  }
  try {
    JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch {
    warn(`Plugin at ${root} has an invalid ecp.manifest.json.`)
  }
}

function touchMarker(): void {
  const marker = path.join(ecpDataDir(), ".ecp-plugins-changed")
  writeFileSync(marker, `${Date.now()}\n`, "utf8")
}
