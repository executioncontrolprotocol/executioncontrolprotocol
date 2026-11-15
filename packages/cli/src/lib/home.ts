import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Resolve absolute `ECP_HOME` (default `~/.ecp`).
 * @category CLI
 */
export function ecpHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.ECP_HOME ?? path.join(os.homedir(), ".ecp"))
}

/**
 * Plugin data dir (`ECP_DATA_DIR` or `$ECP_HOME/plugins`).
 * @category CLI
 */
export function ecpDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = ecpHome(env)
  return path.resolve(env.ECP_DATA_DIR ?? path.join(home, "plugins"))
}

/**
 * Ensure home and data dirs exist; set `ECP_DATA_DIR` on the process env.
 * @category CLI
 */
export function ensureHomeLayout(env: NodeJS.ProcessEnv = process.env): { home: string; dataDir: string } {
  const home = ecpHome(env)
  const dataDir = ecpDataDir(env)
  mkdirSync(home, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  env.ECP_HOME = home
  env.ECP_DATA_DIR = dataDir
  return { home, dataDir }
}
