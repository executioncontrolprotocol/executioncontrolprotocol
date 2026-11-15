import type { Interfaces } from "@oclif/core"

/** Installed oclif plugin snapshot. @category CLI */
export interface InstalledPlugin {
  /** Package name. */
  name: string
  /** Plugin root on disk. */
  root: string
  /** Parsed package.json. */
  pjson: Record<string, unknown>
  /** oclif plugin type when present. */
  type?: string
  /** Installed version. */
  version?: string
}

/**
 * List plugins currently loaded by oclif.
 * @category CLI
 */
export function listInstalledPlugins(config: Interfaces.Config): InstalledPlugin[] {
  const iterable = config.getPluginsList()
  return [...iterable].map((plugin) => ({
    name: plugin.name,
    root: plugin.root,
    pjson: (plugin.pjson ?? {}) as Record<string, unknown>,
    type: plugin.type,
    version: plugin.version,
  }))
}

/**
 * Names of plugins already installed (user, link, or core).
 * @category CLI
 */
export function installedPluginNames(config: Interfaces.Config): Set<string> {
  return new Set(listInstalledPlugins(config).map((plugin) => plugin.name))
}
