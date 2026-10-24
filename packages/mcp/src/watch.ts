import { mkdirSync, watch, type FSWatcher } from "node:fs"
import { PLUGIN_MANIFEST_WATCH_MS } from "./constants.js"

/**
 * Handle returned by {@link watchPluginManifest}.
 * @category MCP
 */
export interface PluginManifestWatch {
  /** Stop watching. */
  close: () => void
}

/**
 * Watch `<dataDir>/package.json` (oclif's plugin manifest) and invoke `onChange`
 * after a short debounce. The directory is created when missing so the first
 * `plugins install` is still observed.
 * @category MCP
 */
export function watchPluginManifest(
  dataDir: string,
  onChange: () => void | Promise<void>
): PluginManifestWatch {
  mkdirSync(dataDir, { recursive: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void onChange()
    }, PLUGIN_MANIFEST_WATCH_MS)
  }
  const watcher: FSWatcher = watch(dataDir, (_event, filename) => {
    const name = filename === null || filename === undefined ? null : String(filename)
    if (name === null || name === "package.json") fire()
  })
  return {
    close: () => {
      if (timer) clearTimeout(timer)
      watcher.close()
    },
  }
}
