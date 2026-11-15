import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs"
import path from "node:path"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { scriptPathsOf } from "./files.js"

const DEBOUNCE_MS = 100
const POLL_MS = 2_000

/**
 * Change payload for execution-file hot reload.
 * @category Host
 */
export interface PathWatchEvent {
  /** Absolute path that changed (execution or a `$script.path`). */
  path: string
  /** Absolute execution file being watched. */
  executionPath: string
}

/**
 * Watch an execution file and its `$script.path` references.
 * Debounces 100 ms; polls every 2 s as a fallback.
 * @category Host
 */
export function watchExecutionPath(
  executionPath: string,
  onChange: (event: PathWatchEvent) => void,
): () => void {
  const resolved = path.resolve(executionPath)
  if (!resolved.endsWith(".ecp.json")) {
    throw new Error("path watch requires a .ecp.json execution file")
  }

  let closed = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  const watchers = new Map<string, FSWatcher>()
  const mtimes = new Map<string, number>()

  const emit = (changedPath: string): void => {
    if (closed) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      if (closed) return
      syncWatchers()
      onChange({ path: changedPath, executionPath: resolved })
    }, DEBOUNCE_MS)
  }

  const touch = (filePath: string): void => {
    try {
      if (!existsSync(filePath)) return
      mtimes.set(filePath, statSync(filePath).mtimeMs)
    } catch {
      // ignore
    }
  }

  const scriptSet = (): string[] => {
    try {
      if (!existsSync(resolved)) return []
      const text = readFileSync(resolved, "utf8")
      const manifest = JSON.parse(text) as ExecutionManifest
      return scriptPathsOf(manifest, path.dirname(resolved))
    } catch {
      return []
    }
  }

  const ensureWatcher = (filePath: string): void => {
    if (watchers.has(filePath) || !existsSync(filePath)) return
    touch(filePath)
    try {
      const watcher = watch(filePath, () => emit(filePath))
      watcher.on("error", () => {
        // Poll fallback covers transient watcher failures.
      })
      watchers.set(filePath, watcher)
    } catch {
      // ignore
    }
  }

  const syncWatchers = (): void => {
    const wanted = new Set<string>([resolved, ...scriptSet()])
    for (const [filePath, watcher] of watchers) {
      if (wanted.has(filePath)) continue
      watcher.close()
      watchers.delete(filePath)
      mtimes.delete(filePath)
    }
    for (const filePath of wanted) ensureWatcher(filePath)
  }

  syncWatchers()

  const poll = setInterval(() => {
    if (closed) return
    const wanted = new Set<string>([resolved, ...scriptSet()])
    for (const filePath of wanted) {
      try {
        if (!existsSync(filePath)) continue
        const next = statSync(filePath).mtimeMs
        const prev = mtimes.get(filePath)
        if (prev !== undefined && prev !== next) emit(filePath)
        mtimes.set(filePath, next)
      } catch {
        // ignore
      }
    }
    syncWatchers()
  }, POLL_MS)

  return () => {
    closed = true
    if (debounce) clearTimeout(debounce)
    clearInterval(poll)
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
    mtimes.clear()
  }
}
