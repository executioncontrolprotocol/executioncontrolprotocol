import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { ECPSystemConfig, SecurityConfig } from "@executioncontrolprotocol/runtime";
import {
  getDefaultConfigPaths,
  loadSystemConfig,
  saveSystemConfig,
} from "@executioncontrolprotocol/runtime";

export function globalConfigYamlPath(): string {
  return resolve(homedir(), ".ecp", "config.yaml");
}

export function globalConfigJsonPath(): string {
  return resolve(homedir(), ".ecp", "config.json");
}

export function globalEcpConfigYamlPath(): string {
  return resolve(homedir(), ".ecp", "ecp.config.yaml");
}

/**
 * All global paths `ecp config reset --global` may remove (same order as discovery elsewhere).
 */
export function getGlobalSystemConfigCandidatePaths(): string[] {
  return [globalConfigJsonPath(), globalConfigYamlPath(), globalEcpConfigYamlPath()];
}

/**
 * Project-local config files `ecp config reset` may remove (YAML and JSON).
 */
export function getLocalSystemConfigPaths(cwd: string): string[] {
  return [resolve(cwd, "ecp.config.yaml"), resolve(cwd, "ecp.config.json")];
}

const GLOBAL_CANDIDATES = (): string[] => getGlobalSystemConfigCandidatePaths();

/**
 * Path to use when writing config (prefers an existing file in scope).
 */
export function resolveWritePathForMutation(options: {
  global: boolean;
  cwd: string;
  explicit?: string;
}): string {
  if (options.explicit) {
    return resolve(options.explicit);
  }
  if (options.global) {
    for (const p of GLOBAL_CANDIDATES()) {
      if (existsSync(p)) return p;
    }
    return globalConfigYamlPath();
  }
  const localYaml = resolve(options.cwd, "ecp.config.yaml");
  const localJson = resolve(options.cwd, "ecp.config.json");
  if (existsSync(localYaml)) return localYaml;
  if (existsSync(localJson)) return localJson;
  return localYaml;
}

export function loadConfigAtPath(path: string): { exists: boolean; config: ECPSystemConfig } {
  if (!existsSync(path)) {
    return { exists: false, config: {} };
  }
  return { exists: true, config: loadSystemConfig(path) };
}

export function readForMutation(options: {
  global: boolean;
  cwd: string;
  explicit?: string;
}): { path: string; config: ECPSystemConfig; isNew: boolean } {
  const path = resolveWritePathForMutation(options);
  const { exists, config } = loadConfigAtPath(path);
  return { path, config, isNew: !exists };
}

export function resolveFirstExistingConfigPath(options: {
  global: boolean;
  cwd: string;
  explicit?: string;
}): string | undefined {
  if (options.explicit) {
    const p = resolve(options.explicit);
    return existsSync(p) ? p : undefined;
  }
  if (options.global) {
    for (const p of GLOBAL_CANDIDATES()) {
      if (existsSync(p)) return p;
    }
    return undefined;
  }
  for (const p of getDefaultConfigPaths(options.cwd)) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Load config for display: first existing file in scope, or empty config at canonical path.
 */
export function loadConfigForDisplay(options: {
  global: boolean;
  cwd: string;
  explicit?: string;
}): { path: string; exists: boolean; config: ECPSystemConfig } {
  if (options.explicit) {
    const p = resolve(options.explicit);
    if (!existsSync(p)) {
      throw new Error(`Config not found: ${p}`);
    }
    return { path: p, exists: true, config: loadSystemConfig(p) };
  }
  const found = resolveFirstExistingConfigPath(options);
  if (found) {
    return { path: found, exists: true, config: loadSystemConfig(found) };
  }
  const path = options.global ? globalConfigYamlPath() : resolve(options.cwd, "ecp.config.yaml");
  return { path, exists: false, config: {} };
}

export function persistConfig(path: string, config: ECPSystemConfig): void {
  saveSystemConfig(path, config);
}

export function addUnique(list: string[] | undefined, id: string): string[] {
  const next = [...(list ?? [])];
  if (!next.includes(id)) next.push(id);
  return next;
}

export function removeId(list: string[] | undefined, id: string): string[] {
  return (list ?? []).filter((x) => x !== id);
}

/** Ensure `config.security` exists for in-place mutation. */
export function touchSecurity(config: ECPSystemConfig): SecurityConfig {
  config.security ??= {};
  return config.security;
}
