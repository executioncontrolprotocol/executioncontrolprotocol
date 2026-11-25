import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/** Stamp file under `$ECP_HOME` so the legacy-plugins notice prints once. */
const LEGACY_NOTICE_STAMP = ".ecp-noticed-legacy-plugins"

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
 * Ensure home and data dirs exist; set `ECP_HOME` / `ECP_DATA_DIR` on the process env.
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

/**
 * oclif's default data dir (`dir('data')` + dirname `ecp`), ignoring `ECP_DATA_DIR`.
 * Windows: `$LOCALAPPDATA/ecp`; else `$XDG_DATA_HOME/ecp` or `$HOME/.local/share/ecp`.
 * @category CLI
 */
export function oclifDefaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home =
    env.HOME ||
    (process.platform === "win32" ? windowsHome(env) : undefined) ||
    os.homedir()
  const base =
    env.XDG_DATA_HOME ||
    (process.platform === "win32" && env.LOCALAPPDATA) ||
    path.join(home, ".local/share")
  return path.join(base, "ecp")
}

/**
 * One-time stderr notice when the OS default oclif data dir still has plugin entries
 * and `$ECP_HOME/plugins` does not. Writes a stamp under `$ECP_HOME` so it prints once.
 * @returns `true` when a notice was printed.
 * @category CLI
 */
export function maybeWarnLegacyPluginDir(
  env: NodeJS.ProcessEnv = process.env,
  stderr: { write(chunk: string): void } = process.stderr,
): boolean {
  const home = ecpHome(env)
  const stampPath = path.join(home, LEGACY_NOTICE_STAMP)
  if (existsSync(stampPath)) return false

  const legacyDir = oclifDefaultDataDir(env)
  const currentDir = ecpDataDir(env)
  if (path.resolve(legacyDir) === path.resolve(currentDir)) return false
  if (!hasPluginEntries(legacyDir)) return false
  if (hasPluginEntries(currentDir)) return false

  stderr.write(
    `notice: legacy plugins found in ${legacyDir}; re-link with: ecp plugins link <path>\n`,
  )
  mkdirSync(home, { recursive: true })
  writeFileSync(stampPath, `${Date.now()}\n`, "utf8")
  return true
}

/**
 * True when `package.json` lists oclif plugins or has dependency entries.
 * @category CLI
 */
export function hasPluginEntries(dataDir: string): boolean {
  const pjsonPath = path.join(dataDir, "package.json")
  if (!existsSync(pjsonPath)) return false
  try {
    const pjson = JSON.parse(readFileSync(pjsonPath, "utf8")) as {
      oclif?: { plugins?: unknown[] }
      dependencies?: Record<string, string>
    }
    if (Array.isArray(pjson.oclif?.plugins) && pjson.oclif.plugins.length > 0) return true
    if (pjson.dependencies && Object.keys(pjson.dependencies).length > 0) return true
    return false
  } catch {
    return false
  }
}

function windowsHome(env: NodeJS.ProcessEnv): string | undefined {
  const { HOMEDRIVE, HOMEPATH, USERPROFILE } = env
  if (HOMEDRIVE && HOMEPATH) return path.join(HOMEDRIVE, HOMEPATH)
  return USERPROFILE
}
