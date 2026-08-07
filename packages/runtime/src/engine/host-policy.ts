/**
 * Host system config policy checks against a loaded Context (tools, loggers, models).
 *
 * @category Engine
 */

import type { ECPContext, Executor, ModelConfig, Mount, Orchestrator } from "@executioncontrolprotocol/spec";

import type { ECPSystemConfig } from "./types.js";
import { getSecurityConfig } from "./system-config-loader.js";
import { assertModelAllowedForProvider, resolveEffectiveModelNameForProvider } from "./model-policy.js";

/**
 * Resolves provider id from an executor {@link ModelConfig} (string or structured ref).
 *
 * @category Engine
 */
export function modelProviderIdFromConfig(model: ModelConfig | undefined): string | undefined {
  if (!model?.provider) return undefined;
  const p = model.provider;
  return typeof p === "string" ? p : p.name;
}

/**
 * Unique model provider ids referenced by any executor or orchestrator in the Context (including the orchestrator node itself).
 *
 * @category Engine
 */
export function collectModelProviderIdsFromContext(context: ECPContext): string[] {
  const ids = new Set<string>();

  const visitExecutor = (executor: Executor): void => {
    const id = modelProviderIdFromConfig(executor.model);
    if (id) ids.add(id);
  };

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    visitExecutor(orchestrator);
    for (const ex of orchestrator.executors ?? []) {
      visitExecutor(ex);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (context.orchestrator) {
    visitOrchestrator(context.orchestrator);
  }
  for (const ex of context.executors ?? []) {
    visitExecutor(ex);
  }

  return [...ids].sort();
}

/**
 * Plugin provider names declared on the Context (`plugins.providers[].name`).
 *
 * @category Engine
 */
export function collectContextPluginProviderNames(context: ECPContext): string[] {
  const names = new Set<string>();
  for (const p of context.plugins?.providers ?? []) {
    if (p.name) names.add(p.name);
  }
  return [...names].sort();
}

function assertModelsProviderWired(providerId: string, systemConfig: ECPSystemConfig | undefined): void {
  if (!systemConfig) return;
  const block = systemConfig.models?.providers?.[providerId];
  if (block === undefined) {
    throw new Error(
      `Provider "${providerId}" is not configured in system config under models.providers.\n` +
        `Add wiring (e.g. ecp config add --type models --provider ${providerId}) or restore models.providers.${providerId} in ecp.config.yaml.`,
    );
  }
}

/**
 * Collect MCP logical server names referenced by Context mounts (all executors / orchestrators).
 *
 * @category Engine
 */
export function collectReferencedMcpServerNames(context: ECPContext): string[] {
  const names = new Set<string>();

  const visitMounts = (mounts: Mount[] | undefined): void => {
    for (const m of mounts ?? []) {
      const s = m.from?.server;
      if (s) names.add(s);
    }
  };

  const visitExecutor = (executor: Executor): void => {
    visitMounts(executor.mounts);
  };

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    visitMounts(orchestrator.mounts);
    for (const ex of orchestrator.executors ?? []) {
      visitExecutor(ex);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (context.orchestrator) {
    visitOrchestrator(context.orchestrator);
  }
  for (const ex of context.executors ?? []) {
    visitExecutor(ex);
  }

  return [...names].sort();
}

export interface HostPolicyOptions {
  /** Selected model from CLI (`--model`), if any. */
  selectedModel?: string;
  /** Provider id (built-in or extension) after inference / CLI override. */
  providerId: string;
  /** Logger ids enabled for this run (from `--logger` or security default). */
  loggersEnabled: string[];
}

/**
 * Validates model allowlist, logger allowlist, and MCP server wiring/policy for the Context.
 * Throws {@link Error} with a host-oriented message when policy blocks execution.
 *
 * @category Engine
 */
export function assertHostPolicyForContext(context: ECPContext, systemConfig: ECPSystemConfig | undefined, options: HostPolicyOptions): void {
  for (const id of collectModelProviderIdsFromContext(context)) {
    assertModelsProviderWired(id, systemConfig);
  }

  const sec = getSecurityConfig(systemConfig);

  const secModels = sec?.models;
  const enableFromConfig = secModels?.defaultProviders ?? [];
  const enableForRun = [...new Set([...enableFromConfig, options.providerId])];
  const allowProviders = secModels?.allowProviders;
  if (allowProviders && allowProviders.length > 0) {
    for (const id of enableForRun) {
      if (!allowProviders.includes(id)) {
        throw new Error(
          `Provider "${id}" cannot be used because it is not in system config security.models.allowProviders.\n` +
            `Allowed: ${allowProviders.join(", ")}\n` +
            `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
        );
      }
    }
  }

  const allowIds = sec?.plugins?.allowIds;
  if (allowIds?.length && !allowIds.includes(options.providerId)) {
    throw new Error(
      `Provider "${options.providerId}" is blocked by system config security.plugins.allowIds.\n` +
        `Allowed IDs: ${allowIds.join(", ")}\n` +
        `Update your config first (ecp.config.yaml / ecp config) and rerun.`,
    );
  }

  if (allowIds?.length) {
    for (const name of collectContextPluginProviderNames(context)) {
      if (!allowIds.includes(name)) {
        throw new Error(
          `Context declares plugin provider "${name}" but it is not in system config security.plugins.allowIds.\n` +
            `Allowed IDs: ${allowIds.join(", ")}\n` +
            `Update security policy or the Context.`,
        );
      }
    }
  }

  const effectiveModel = resolveEffectiveModelNameForProvider(options.providerId, options.selectedModel, systemConfig);
  assertModelAllowedForProvider(options.providerId, effectiveModel, systemConfig);

  const secLoggers = sec?.loggers;
  const loggersAllow = secLoggers?.allowEnable;
  if (loggersAllow && loggersAllow.length > 0) {
    for (const id of options.loggersEnabled) {
      if (!loggersAllow.includes(id)) {
        throw new Error(
          `Logger "${id}" is not in system config security.loggers.allowEnable. Allowed: ${loggersAllow.join(", ")}`,
        );
      }
    }
  }

  const servers = systemConfig?.tools?.servers ?? {};
  const allowServers = sec?.tools?.allowServers;
  const referenced = collectReferencedMcpServerNames(context);

  for (const name of referenced) {
    if (!(name in servers)) {
      throw new Error(
        `Context references MCP server "${name}" in a mount, but tools.servers.${name} is not defined in system config.\n` +
          `Add wiring (ecp config add --type tools) or fix the Context.`,
      );
    }
    if (allowServers !== undefined && allowServers.length > 0 && !allowServers.includes(name)) {
      throw new Error(
        `Context requires MCP server "${name}", but it is not listed in security.tools.allowServers.\n` +
          `Allowed: ${allowServers.join(", ")}\n` +
          `Update security policy (ecp config security) or the Context.`,
      );
    }
  }
}
