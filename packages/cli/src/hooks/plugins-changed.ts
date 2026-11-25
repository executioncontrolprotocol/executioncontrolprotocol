import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Hook } from "@oclif/core"
import { ecpDataDir } from "../lib/home.js"
import { touchPluginsChangedMarker } from "../lib/plugin-mgmt.js"

const PLUGIN_MUTATIONS = new Set([
  "plugins:install",
  "plugins:link",
  "plugins:uninstall",
  "plugins:update",
  "plugins:reset",
  "plugins install",
  "plugins link",
  "plugins uninstall",
  "plugins update",
  "plugins reset",
])

/**
 * After plugin install/link/uninstall/update/reset: warn on missing/invalid manifest and touch the change marker.
 * ECP-owned commands call {@link touchPluginsChangedMarker} before `writeEnvelope` because `process.exit` skips `finally`.
 * oclif plugin-plugins v5 does not emit plugins:post* hooks, so this runs from `finally` as a backstop.
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
  touchPluginsChangedMarker()
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
  touchPluginsChangedMarker()
}

export default finallyHook

function collectRoots(
  id: string,
  argv: string[],
  config: {
    dataDir?: string
    plugins?: Map<string, { root?: string; type?: string; name?: string }> | Array<{ root?: string; type?: string; name?: string }>
  },
): string[] {
  if (id.includes("link")) {
    const target = argv.find((arg) => !arg.startsWith("-"))
    if (target) return [path.resolve(target)]
  }
  const plugins = config.plugins
  const list = plugins ? (plugins instanceof Map ? [...plugins.values()] : plugins) : []
  const fromConfig = list
    .filter((plugin) => plugin.type === "user" || plugin.type === "link")
    .map((plugin) => plugin.root)
    .filter((root): root is string => Boolean(root))
  if (fromConfig.length > 0) return fromConfig
  // With `userPlugins: false`, linked/user plugins are not in config.plugins — read the data dir.
  return rootsFromDataDir(config.dataDir ?? ecpDataDir())
}

function rootsFromDataDir(dataDir: string): string[] {
  const pjsonPath = path.join(dataDir, "package.json")
  if (!existsSync(pjsonPath)) return []
  try {
    const pjson = JSON.parse(readFileSync(pjsonPath, "utf8")) as {
      oclif?: { plugins?: Array<string | { name: string; type?: string; root?: string }> }
      dependencies?: Record<string, string>
    }
    const roots: string[] = []
    for (const entry of pjson.oclif?.plugins ?? []) {
      if (typeof entry === "string") {
        roots.push(path.join(dataDir, "node_modules", entry))
        continue
      }
      if (entry.type === "link" && entry.root) roots.push(entry.root)
      else roots.push(path.join(dataDir, "node_modules", entry.name))
    }
    for (const name of Object.keys(pjson.dependencies ?? {})) {
      const candidate = path.join(dataDir, "node_modules", name)
      if (!roots.includes(candidate)) roots.push(candidate)
    }
    return roots
  } catch {
    return []
  }
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

