import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

let loaded = false

/**
 * Walk upward from a start directory until `pnpm-workspace.yaml` is found.
 * @category Evals
 */
export function findEvalRepoRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string | undefined {
  let dir = startDir
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/**
 * Parse a dotenv-style file into key/value pairs (no expansion).
 * @category Evals
 */
export function parseDotEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }
    const eq = line.indexOf("=")
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * Load repo-root `.env` / `.env.local` into `process.env` without overwriting
 * keys that are already set (non-empty) in the process environment.
 * @category Evals
 */
export function ensureEvalEnvLoaded(options?: {
  /** Force a reload (tests). */
  force?: boolean
  /** Override repo root discovery. */
  root?: string
}): void {
  if (loaded && !options?.force) {
    return
  }
  loaded = true
  const root = options?.root ?? findEvalRepoRoot()
  if (!root) {
    return
  }
  for (const name of [".env", ".env.local"] as const) {
    const path = join(root, name)
    if (!existsSync(path)) {
      continue
    }
    const parsed = parseDotEnvFile(readFileSync(path, "utf8"))
    for (const [key, value] of Object.entries(parsed)) {
      const current = process.env[key]
      if (current === undefined || current.trim() === "") {
        process.env[key] = value
      }
    }
  }
}

/** Reset load gate for unit tests. @category Evals */
export function resetEvalEnvLoadedForTests(): void {
  loaded = false
}
