/**
 * Merge project-local and user-global system config so global values win on conflict.
 *
 * @category Engine
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { ECPSystemConfig } from "./types.js";
import { loadSystemConfig } from "./system-config-loader.js";

const CONFIG_FILENAME = "ecp.config.yaml";
const CONFIG_JSON_FILENAME = "ecp.config.json";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Deep-merge two values; when both sides are plain objects, recurse; when `global` is an array,
 * it replaces `local`; otherwise scalar / non-object `global` wins.
 *
 * @category Engine
 */
export function mergeSystemConfigGlobalOverLocal(local: ECPSystemConfig, global: ECPSystemConfig): ECPSystemConfig {
  return deepMergePreferGlobal(local, global) as ECPSystemConfig;
}

function deepMergePreferGlobal(local: unknown, global: unknown): unknown {
  if (global === undefined) return local;
  if (global === null) return global;
  if (Array.isArray(global)) return global;
  if (isPlainObject(global)) {
    if (!isPlainObject(local)) {
      const out: Record<string, unknown> = {};
      for (const [k, gv] of Object.entries(global)) {
        out[k] = deepMergePreferGlobal(undefined, gv);
      }
      return out;
    }
    const out: Record<string, unknown> = { ...local };
    for (const [k, gv] of Object.entries(global)) {
      out[k] = deepMergePreferGlobal(local[k], gv);
    }
    return out;
  }
  return global;
}

/**
 * First existing project-local config path (cwd), or undefined.
 *
 * @category Engine
 */
export function resolveLocalSystemConfigPath(cwd: string): string | undefined {
  for (const p of [resolve(cwd, CONFIG_FILENAME), resolve(cwd, CONFIG_JSON_FILENAME)]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * First existing user-global config path under `~/.ecp/`, or undefined.
 *
 * @category Engine
 */
export function resolveGlobalSystemConfigPath(): string | undefined {
  const home = homedir();
  for (const p of [
    resolve(home, ".ecp", "config.yaml"),
    resolve(home, ".ecp", "config.json"),
    resolve(home, ".ecp", CONFIG_FILENAME),
  ]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Message thrown when no system config file exists but host commands require one.
 *
 * @category Engine
 */
export const MISSING_MERGED_SYSTEM_CONFIG_MESSAGE =
  'No system configuration file found. Create ecp.config.yaml in the project (e.g. copy config/ecp.config.example.yaml), run "ecp config init", add ~/.ecp/config.yaml, or pass --config <path> to a YAML/JSON file. Host security policy requires an on-disk system config.';

/**
 * Like {@link resolveMergedSystemConfig}, but throws if no file was loaded (merged discovery found nothing).
 *
 * @category Engine
 */
export function resolveMergedSystemConfigRequired(
  explicitPath: string | undefined,
  cwd: string,
): ECPSystemConfig {
  const c = resolveMergedSystemConfig(explicitPath, cwd);
  if (!c) {
    throw new Error(MISSING_MERGED_SYSTEM_CONFIG_MESSAGE);
  }
  return c;
}

/**
 * Load merged system config: explicit path loads a single file; otherwise merge global over local
 * when both exist.
 *
 * @category Engine
 */
export function resolveMergedSystemConfig(explicitPath: string | undefined, cwd: string): ECPSystemConfig | undefined {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`System config not found: ${explicitPath}`);
    }
    return loadSystemConfig(explicitPath);
  }
  const localPath = resolveLocalSystemConfigPath(cwd);
  const globalPath = resolveGlobalSystemConfigPath();
  const local = localPath ? loadSystemConfig(localPath) : undefined;
  const globalCfg = globalPath ? loadSystemConfig(globalPath) : undefined;
  if (!local && !globalCfg) return undefined;
  if (!local) return globalCfg;
  if (!globalCfg) return local;
  return mergeSystemConfigGlobalOverLocal(local, globalCfg);
}
