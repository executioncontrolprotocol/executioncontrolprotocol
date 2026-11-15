import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * One discovered plugin package root.
 * @category Plugins
 */
export interface DiscoveredPlugin {
  /** Absolute package root. */
  root: string
  /** How it was discovered. */
  source: "user" | "link" | "core"
}

/**
 * Read oclif-shaped plugin roots from a data directory and extra plugin paths.
 * @category Plugins
 */
export async function discoverPluginRoots(options: {
  /** `$ECP_DATA_DIR`. */
  dataDir?: string
  /** Absolute or cwd-relative package roots from host settings. */
  extraPlugins?: string[]
}): Promise<DiscoveredPlugin[]> {
  const found: DiscoveredPlugin[] = []
  const seen = new Set<string>()

  const add = (root: string, source: DiscoveredPlugin["source"]): void => {
    const absolute = path.resolve(root)
    if (seen.has(absolute)) return
    seen.add(absolute)
    found.push({ root: absolute, source })
  }

  if (options.dataDir) {
    const dataDir = path.resolve(options.dataDir)
    const packagePath = path.join(dataDir, "package.json")
    try {
      const pkg = JSON.parse(await readFile(packagePath, "utf8")) as {
        dependencies?: Record<string, string>
        oclif?: { plugins?: Array<string | { type?: string; name?: string; root?: string }> }
      }
      for (const name of Object.keys(pkg.dependencies ?? {})) {
        add(path.join(dataDir, "node_modules", name), "user")
      }
      for (const entry of pkg.oclif?.plugins ?? []) {
        if (typeof entry === "string") {
          add(path.join(dataDir, "node_modules", entry), "user")
          continue
        }
        if (entry.type === "link" && entry.root) {
          add(entry.root, "link")
        } else if (entry.name) {
          add(path.join(dataDir, "node_modules", entry.name), "user")
        }
      }
    } catch {
      // Missing data-dir package.json is fine; extraPlugins still apply.
    }
  }

  for (const extra of options.extraPlugins ?? []) add(extra, "core")
  return found
}
