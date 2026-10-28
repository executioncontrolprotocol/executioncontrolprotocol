import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * Filenames searched when resolving the user default environment overlay.
 * @category App
 */
export const USER_ENVIRONMENT_FILENAMES = [
  "environment.ecp.ts",
  "environment.ecp.js",
  "environment.ts",
] as const

/**
 * Overlay path for `ecp app`: `--env` wins, else the first matching file in
 * `configDir` (`~/.ecp/config`).
 *
 * @category App
 */
export function resolveAppOverlayPath(options: {
  /** `--env` flag value. */
  envFlag?: string
  /** oclif `config.configDir`. */
  configDir?: string
}): string | undefined {
  if (options.envFlag) return resolve(options.envFlag)
  if (!options.configDir) return undefined
  for (const name of USER_ENVIRONMENT_FILENAMES) {
    const candidate = join(options.configDir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}
