/**
 * Resolve and apply ECP_HOME / ECP_DATA_DIR before oclif Config.load.
 * Plain JS so the bin does not depend on dist/.
 * Keep semantics aligned with `src/lib/home.ts` (parity tested in unit tests).
 */
import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Absolute `ECP_HOME` (default `~/.ecp`).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveEcpHome(env = process.env) {
  return path.resolve(env.ECP_HOME ?? path.join(os.homedir(), ".ecp"))
}

/**
 * Plugin data dir (`ECP_DATA_DIR` or `$ECP_HOME/plugins`).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveEcpDataDir(env = process.env) {
  const home = resolveEcpHome(env)
  return path.resolve(env.ECP_DATA_DIR ?? path.join(home, "plugins"))
}

/**
 * Ensure home and data dirs exist; set both on the given env.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ home: string, dataDir: string }}
 */
export function setupEcpEnv(env = process.env) {
  const home = resolveEcpHome(env)
  const dataDir = resolveEcpDataDir(env)
  mkdirSync(home, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  env.ECP_HOME = home
  env.ECP_DATA_DIR = dataDir
  return { home, dataDir }
}
