import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * Filenames searched when resolving the user default config file.
 * @category App
 */
export const USER_CONFIG_FILENAMES = ["config.ecp.ts", "config.ecp.js", "config.ts"] as const

/** Undocumented fallback names from the pre-config environment file. @category App */
export const LEGACY_ENVIRONMENT_FILENAMES = [
  "environment.ecp.ts",
  "environment.ecp.js",
  "environment.ts",
] as const

/**
 * Config path for `ecp app`: `--config` wins, else the first matching file in
 * `configDir` (`~/.ecp/config`).
 *
 * @category App
 */
export function resolveAppConfigPath(options: {
  /** `--config` flag value. */
  configFlag?: string
  /** oclif `config.configDir`. */
  configDir?: string
}): string | undefined {
  if (options.configFlag) return resolve(options.configFlag)
  if (!options.configDir) return undefined
  for (const name of [...USER_CONFIG_FILENAMES, ...LEGACY_ENVIRONMENT_FILENAMES]) {
    const candidate = join(options.configDir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}
