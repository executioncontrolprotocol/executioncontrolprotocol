import { homedir } from "node:os"
import { join } from "node:path"

/** Directory name of the global ECP home under the user profile. @category CLI */
export const ECP_HOME_DIRNAME = ".ecp"

/** Subdirectory of the global home that holds authored config. @category CLI */
export const ECP_HOME_CONFIG = "config"

/** Subdirectory of the global home that holds machine-managed state. @category CLI */
export const ECP_HOME_DATA = "data"

/** Subdirectory of the global home that holds caches. @category CLI */
export const ECP_HOME_CACHE = "cache"

/**
 * Default global ECP home (`~/.ecp`).
 * @category CLI
 */
export function defaultEcpHome(home: string = homedir()): string {
  return join(home, ECP_HOME_DIRNAME)
}

/**
 * Set `ECP_CONFIG_DIR`, `ECP_DATA_DIR`, and `ECP_CACHE_DIR` to `~/.ecp/{config,data,cache}`
 * when neither the ECP override nor the matching XDG variable is already set.
 * @category CLI
 */
export function applyDefaultEcpHome(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir()
): void {
  const root = defaultEcpHome(home)
  if (!env.ECP_CONFIG_DIR && !env.XDG_CONFIG_HOME) {
    env.ECP_CONFIG_DIR = join(root, ECP_HOME_CONFIG)
  }
  if (!env.ECP_DATA_DIR && !env.XDG_DATA_HOME) {
    env.ECP_DATA_DIR = join(root, ECP_HOME_DATA)
  }
  if (!env.ECP_CACHE_DIR && !env.XDG_CACHE_HOME) {
    env.ECP_CACHE_DIR = join(root, ECP_HOME_CACHE)
  }
}
