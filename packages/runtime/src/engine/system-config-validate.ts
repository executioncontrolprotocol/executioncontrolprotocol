/**
 * Structural checks aligning a parsed {@link ECPSystemConfig} with the v0.5 host spec
 * (see SPEC.md “Host system configuration” and `config/ecp.config.example.yaml`).
 *
 * @category Engine
 */

import { PLUGIN_KINDS } from "@executioncontrolprotocol/spec";
import { getEffectiveSupportedModels } from "./model-policy.js";
import { SYSTEM_CONFIG_SCHEMA_VERSION } from "./system-config-loader.js";
import type { ECPSystemConfig, SecurityConfig } from "./types.js";

const PLUGIN_KIND_SET = new Set<string>(PLUGIN_KINDS);

const REQUIRED_SECURITY_AREAS = [
  "models",
  "tools",
  "executors",
  "memory",
  "agents",
  "loggers",
  "secrets",
  "plugins",
] as const;

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Returns human-readable spec violations (empty array = aligned with the v0.5 rules we enforce).
 * Does not throw; callers may assert `errors.length === 0`.
 */
export function validateSystemConfigAgainstSpec(config: ECPSystemConfig): string[] {
  const errors: string[] = [];

  if (config.version !== SYSTEM_CONFIG_SCHEMA_VERSION) {
    errors.push(
      `version must be "${SYSTEM_CONFIG_SCHEMA_VERSION}" (got ${config.version === undefined ? "undefined" : JSON.stringify(config.version)})`,
    );
  }

  const secRaw = config.security;
  if (!isNonEmptyObject(secRaw)) {
    errors.push('top-level "security" must be an object');
    return errors;
  }

  const sec = secRaw as SecurityConfig;

  for (const area of REQUIRED_SECURITY_AREAS) {
    if (!isNonEmptyObject(sec[area])) {
      errors.push(`security.${area} must be an object`);
    }
  }

  const kinds = sec.plugins?.allowKinds;
  if (kinds) {
    for (const k of kinds) {
      if (!PLUGIN_KIND_SET.has(k)) {
        errors.push(
          `security.plugins.allowKinds contains unknown kind ${JSON.stringify(k)} (expected one of: ${PLUGIN_KINDS.join(", ")})`,
        );
      }
    }
  }

  const allowProviders = sec.models?.allowProviders;
  const providers = config.models?.providers;
  const securityAllowedModels = sec.models?.allowedModels;

  if (allowProviders?.length && isNonEmptyObject(providers)) {
    for (const id of allowProviders) {
      if (!(id in providers)) {
        errors.push(
          `security.models.allowProviders includes ${JSON.stringify(id)} but models.providers.${id} is not defined`,
        );
      }
    }
  }

  if (allowProviders?.length) {
    for (const id of allowProviders) {
      const list = securityAllowedModels?.[id];
      if (!list || list.length === 0) {
        errors.push(
          `security.models.allowedModels for provider ${JSON.stringify(id)} must be a non-empty array when ${JSON.stringify(id)} is in security.models.allowProviders`,
        );
      }
    }
  }

  if (isNonEmptyObject(providers)) {
    for (const [id, block] of Object.entries(providers)) {
      const dm = block?.defaultModel;
      const supported = getEffectiveSupportedModels(block);
      if (dm !== undefined && supported !== undefined && supported.length > 0 && !supported.includes(dm)) {
        errors.push(
          `models.providers.${id}.defaultModel ${JSON.stringify(dm)} is not in the supported model set for models.providers.${id} (supportedModels or defaultModel-only fallback)`,
        );
      }
    }
  }

  if (isNonEmptyObject(providers) && securityAllowedModels && isNonEmptyObject(securityAllowedModels)) {
    for (const [providerId, modelNames] of Object.entries(securityAllowedModels)) {
      if (!Array.isArray(modelNames)) continue;
      const block = providers![providerId];
      if (!block) continue;
      const supported = getEffectiveSupportedModels(block);
      if (!supported?.length) continue;
      for (const m of modelNames) {
        if (!supported.includes(m)) {
          errors.push(
            `security.models.allowedModels.${providerId} includes ${JSON.stringify(m)} which is not supported by models.providers.${providerId} (supportedModels / defaultModel)`,
          );
        }
      }
    }
  }

  const allowServers = sec.tools?.allowServers;
  const servers = config.tools?.servers;
  if (allowServers?.length && isNonEmptyObject(servers)) {
    for (const name of allowServers) {
      if (!(name in servers)) {
        errors.push(
          `security.tools.allowServers includes ${JSON.stringify(name)} but tools.servers.${name} is not defined`,
        );
      }
    }
  }

  const logAllow = sec.loggers?.allowEnable;
  const logCfg = config.loggers?.config;
  if (logAllow?.length && isNonEmptyObject(logCfg)) {
    for (const id of logAllow) {
      if (!(id in logCfg)) {
        errors.push(
          `security.loggers.allowEnable includes ${JSON.stringify(id)} but loggers.config.${id} is not defined`,
        );
      }
    }
  }

  const agentAllow = sec.agents?.allowEndpoints;
  const endpoints = config.agents?.endpoints;
  if (agentAllow?.length) {
    if (!isNonEmptyObject(endpoints)) {
      errors.push(
        "security.agents.allowEndpoints is non-empty but agents.endpoints is missing or empty",
      );
    } else {
      for (const name of agentAllow) {
        if (!(name in endpoints)) {
          errors.push(
            `security.agents.allowEndpoints includes ${JSON.stringify(name)} but agents.endpoints.${name} is not defined`,
          );
        }
      }
    }
  }

  const execAllow = sec.executors?.allowExecutors;
  const instances = config.executors?.instances;
  if (execAllow?.length) {
    if (!isNonEmptyObject(instances)) {
      errors.push(
        "security.executors.allowExecutors is non-empty but executors.instances is missing or empty",
      );
    } else {
      for (const id of execAllow) {
        if (!(id in instances)) {
          errors.push(
            `security.executors.allowExecutors includes ${JSON.stringify(id)} but executors.instances.${id} is not defined`,
          );
        }
      }
    }
  }

  const storeAllow = sec.memory?.allowStores;
  const stores = config.memory?.stores;
  if (storeAllow?.length) {
    if (!isNonEmptyObject(stores)) {
      errors.push("security.memory.allowStores is non-empty but memory.stores is missing or empty");
    } else {
      for (const id of storeAllow) {
        if (!(id in stores)) {
          errors.push(
            `security.memory.allowStores includes ${JSON.stringify(id)} but memory.stores.${id} is not defined`,
          );
        }
      }
    }
  }

  const defaultStore = sec.memory?.defaultStore;
  if (defaultStore !== undefined && storeAllow?.length && !storeAllow.includes(defaultStore)) {
    errors.push(
      `security.memory.defaultStore ${JSON.stringify(defaultStore)} is not listed in security.memory.allowStores`,
    );
  }

  const defaultProviders = sec.models?.defaultProviders;
  if (defaultProviders?.length && allowProviders?.length) {
    for (const id of defaultProviders) {
      if (!allowProviders.includes(id)) {
        errors.push(
          `security.models.defaultProviders includes ${JSON.stringify(id)} which is not in security.models.allowProviders`,
        );
      }
    }
  }

  const execDefault = sec.executors?.defaultEnable;
  if (execDefault?.length && execAllow?.length) {
    for (const id of execDefault) {
      if (!execAllow.includes(id)) {
        errors.push(
          `security.executors.defaultEnable includes ${JSON.stringify(id)} which is not in security.executors.allowExecutors`,
        );
      }
    }
  }

  const agentDefault = sec.agents?.defaultEnable;
  const agentAllowList = sec.agents?.allowEndpoints;
  if (agentDefault?.length && agentAllowList?.length) {
    for (const id of agentDefault) {
      if (!agentAllowList.includes(id)) {
        errors.push(
          `security.agents.defaultEnable includes ${JSON.stringify(id)} which is not in security.agents.allowEndpoints`,
        );
      }
    }
  }

  const loggerDefault = sec.loggers?.defaultEnable;
  const loggerAllow = sec.loggers?.allowEnable;
  if (loggerDefault?.length && loggerAllow?.length) {
    for (const id of loggerDefault) {
      if (!loggerAllow.includes(id)) {
        errors.push(
          `security.loggers.defaultEnable includes ${JSON.stringify(id)} which is not in security.loggers.allowEnable`,
        );
      }
    }
  }

  return errors;
}
