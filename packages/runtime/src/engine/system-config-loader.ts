/**
 * System config loader — reads ECP system config (ecp.config.yaml) from
 * a given path or default locations.
 *
 * @category Engine
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import type { AgentEndpointConfig, ECPSystemConfig, SecurityConfig } from "./types.js";

const CONFIG_FILENAME = "ecp.config.yaml";
const CONFIG_JSON_FILENAME = "ecp.config.json";

/**
 * Default paths to look for system config, in order of precedence.
 * First existing file wins.
 *
 * @param cwd - Current working directory (e.g. process.cwd()).
 * @returns List of absolute paths to try.
 *
 * @category Engine
 */
export function getDefaultConfigPaths(cwd: string): string[] {
  const home = homedir();
  return [
    resolve(cwd, CONFIG_FILENAME),
    resolve(cwd, CONFIG_JSON_FILENAME),
    resolve(home, ".ecp", "config.yaml"),
    resolve(home, ".ecp", "config.json"),
    resolve(home, ".ecp", CONFIG_FILENAME),
  ];
}

/**
 * System config schema version this runtime expects (document `version` field).
 *
 * @category Engine
 */
export const SYSTEM_CONFIG_SCHEMA_VERSION = "0.5";

/**
 * Policy subtree from system config (`security` mirrors each configure area).
 *
 * @category Engine
 */
export function getSecurityConfig(config: ECPSystemConfig | undefined): SecurityConfig | undefined {
  return config?.security;
}

/**
 * Reject unknown `version` values when set.
 *
 * @category Engine
 */
export function assertSystemConfigSchemaVersion(config: ECPSystemConfig | undefined): void {
  if (!config) return;
  if (config.version !== undefined && config.version !== SYSTEM_CONFIG_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported system config version "${String(config.version)}". This build expects "${SYSTEM_CONFIG_SCHEMA_VERSION}". See CHANGELOG for migration.`,
    );
  }
}

/**
 * Build the flat A2A URL map passed to {@link EngineConfig.agentEndpoints}.
 * Accepts `agents.endpoints.<name>` as `{ url }` or a legacy plain string.
 *
 * @category Engine
 */
export function resolveAgentEndpointsMap(config: ECPSystemConfig | undefined): Record<string, string> {
  const raw = config?.agents?.endpoints;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (typeof entry === "string") {
      out[name] = entry;
    } else if (entry && typeof entry === "object" && typeof (entry as AgentEndpointConfig).url === "string") {
      out[name] = (entry as AgentEndpointConfig).url;
    }
  }
  return out;
}

function parseSystemConfigFromParsed(parsed: unknown, sourceLabel: string): ECPSystemConfig {
  const config = parsed as ECPSystemConfig;
  if (!config || typeof config !== "object") {
    throw new Error(`Failed to parse system config from ${sourceLabel}: not an object`);
  }
  assertSystemConfigSchemaVersion(config);
  return config;
}

/**
 * Parse system config from a YAML or JSON string (used by CLI defaults and tests).
 *
 * @category Engine
 */
export function parseSystemConfigString(raw: string, format: "yaml" | "json"): ECPSystemConfig {
  let parsed: unknown;
  if (format === "json") {
    parsed = JSON.parse(raw);
  } else {
    parsed = yaml.load(raw);
  }
  return parseSystemConfigFromParsed(parsed, "string");
}

export function loadSystemConfig(filePath: string): ECPSystemConfig {
  const raw = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  let parsed: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    parsed = yaml.load(raw);
  } else if (ext === ".json") {
    parsed = JSON.parse(raw);
  } else {
    parsed = yaml.load(raw);
  }

  return parseSystemConfigFromParsed(parsed, filePath);
}

/**
 * Serialize config for display (no file I/O).
 *
 * @category Engine
 */
export function stringifySystemConfig(config: ECPSystemConfig, format: "yaml" | "json"): string {
  if (format === "json") {
    return `${JSON.stringify(config, null, 2)}\n`;
  }
  let body = yaml.dump(config, { lineWidth: 120, noRefs: true });
  if (!body.endsWith("\n")) body += "\n";
  return body;
}

export function saveSystemConfig(filePath: string, config: ECPSystemConfig): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const ext = extname(filePath).toLowerCase();
  const format: "yaml" | "json" = ext === ".json" ? "json" : "yaml";
  writeFileSync(filePath, stringifySystemConfig(config, format), "utf-8");
}

/**
 * Load system config from an explicit path, or from the first default
 * location that exists.
 *
 * @param explicitPath - If set, load from this path only.
 * @param cwd - Current working directory for default path resolution.
 * @returns The loaded config, or undefined if no config file was found.
 *
 * @category Engine
 */
export function resolveSystemConfig(
  explicitPath: string | undefined,
  cwd: string,
): ECPSystemConfig | undefined {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`System config not found: ${explicitPath}`);
    }
    return loadSystemConfig(explicitPath);
  }
  for (const p of getDefaultConfigPaths(cwd)) {
    if (existsSync(p)) {
      return loadSystemConfig(p);
    }
  }
  return undefined;
}
