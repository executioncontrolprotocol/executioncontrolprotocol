/**
 * Pure wiring mutations for system config (models.providers, tools.servers,
 * loggers.config, agents.endpoints). Policy lives under security.* only.
 */

import {
  type ECPSystemConfig,
  getEffectiveSupportedModels,
  type ModelProviderConfig,
  type SecurityConfig,
} from "@executioncontrolprotocol/runtime";

export const WIRING_TYPES = ["tools", "models", "loggers", "endpoints"] as const;
export type WiringType = (typeof WIRING_TYPES)[number];

export function isWiringType(s: string): s is WiringType {
  return (WIRING_TYPES as readonly string[]).includes(s);
}

export function assertToolServerEntry(parsed: unknown): asserts parsed is {
  transport: Record<string, unknown>;
} {
  if (!parsed || typeof parsed !== "object" || !("transport" in (parsed as object))) {
    throw new Error('Tool server entry must be a JSON object with a "transport" field.');
  }
}

export function assertPlainObject(parsed: unknown): asserts parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Value must be a JSON object.");
  }
}

const SECURITY_AREA_KEYS = [
  "models",
  "tools",
  "executors",
  "memory",
  "agents",
  "loggers",
  "secrets",
  "plugins",
] as const;

/**
 * Ensure `security.<area>` exists as an object for each v0.5 area (required by host validation).
 *
 * @category Config CLI
 */
export function ensureSecurityAreaObjects(config: ECPSystemConfig): void {
  config.security ??= {} as SecurityConfig;
  const sec = config.security as unknown as Record<string, Record<string, unknown>>;
  for (const key of SECURITY_AREA_KEYS) {
    sec[key] ??= {};
  }
}

/**
 * Append a tool server name to `security.tools.allowServers` when missing.
 *
 * @category Config CLI
 */
export function ensureSecurityToolServerAllowed(config: ECPSystemConfig, name: string): void {
  ensureSecurityAreaObjects(config);
  const cur = config.security!.tools!.allowServers ?? [];
  if (!cur.includes(name)) {
    config.security!.tools!.allowServers = [...cur, name];
  }
}

/**
 * Append a logger id to `security.loggers.allowEnable` when missing.
 *
 * @category Config CLI
 */
export function ensureSecurityLoggerAllowed(config: ECPSystemConfig, id: string): void {
  ensureSecurityAreaObjects(config);
  const cur = config.security!.loggers!.allowEnable ?? [];
  if (!cur.includes(id)) {
    config.security!.loggers!.allowEnable = [...cur, id];
  }
}

/**
 * Append an agents endpoint name to `security.agents.allowEndpoints` when missing.
 *
 * @category Config CLI
 */
export function ensureSecurityAgentEndpointAllowed(config: ECPSystemConfig, name: string): void {
  ensureSecurityAreaObjects(config);
  const cur = config.security!.agents!.allowEndpoints ?? [];
  if (!cur.includes(name)) {
    config.security!.agents!.allowEndpoints = [...cur, name];
  }
}

/**
 * After wiring `models.providers.<id>`, ensure `security.models.allowProviders` and
 * `security.models.allowedModels` are seeded so the file passes structural validation.
 *
 * @category Config CLI
 */
export function ensureSecurityModelPolicyFromWiring(config: ECPSystemConfig, providerId: string): void {
  ensureSecurityAreaObjects(config);
  const block = config.models?.providers?.[providerId];
  if (!block) return;
  const supported = getEffectiveSupportedModels(block);
  if (!supported?.length) return;

  const sec = config.security!.models!;
  const ap = sec.allowProviders ?? [];
  if (!ap.includes(providerId)) {
    sec.allowProviders = [...ap, providerId];
  }

  const am = sec.allowedModels ?? {};
  if (!am[providerId]?.length) {
    sec.allowedModels = { ...am, [providerId]: [...supported] };
  }
}

/**
 * Ensure `defaultModel` appears in `supportedModels` when a default is set.
 *
 * @category Config CLI
 */
export function normalizeModelProviderDefaultInSupported(block: ModelProviderConfig): ModelProviderConfig {
  const dm = block.defaultModel;
  if (dm === undefined) return block;
  const sm = block.supportedModels;
  if (!sm || sm.length === 0) {
    return { ...block, supportedModels: [dm] };
  }
  if (sm.includes(dm)) return block;
  return { ...block, supportedModels: [...sm, dm] };
}

/** Shallow merge provider fields; deep-merge `config` when both sides are objects. */
export function mergeModelProviderBlock(
  existing: ModelProviderConfig | undefined,
  patch: Record<string, unknown>,
): ModelProviderConfig {
  const base = (existing ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (
      k === "config" &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      base.config &&
      typeof base.config === "object" &&
      !Array.isArray(base.config)
    ) {
      out.config = { ...(base.config as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      out[k] = v;
    }
  }
  return normalizeModelProviderDefaultInSupported(out as ModelProviderConfig);
}

export function wiringToolsAdd(
  config: ECPSystemConfig,
  name: string,
  entry: { transport: Record<string, unknown> },
): void {
  config.tools ??= {};
  config.tools.servers ??= {};
  if (config.tools.servers[name]) {
    throw new Error(
      `Tool server "${name}" already exists. Use "ecp config update --type tools" to replace it.`,
    );
  }
  config.tools.servers[name] = entry;
}

export function wiringToolsUpdate(
  config: ECPSystemConfig,
  name: string,
  entry: { transport: Record<string, unknown> },
): void {
  config.tools ??= {};
  config.tools.servers ??= {};
  if (!config.tools.servers[name]) {
    throw new Error(`No tool server named "${name}". Use "ecp config add --type tools" first.`);
  }
  config.tools.servers[name] = entry;
}

export function wiringToolsRemove(config: ECPSystemConfig, name: string): void {
  if (config.tools?.servers && name in config.tools.servers) {
    delete config.tools.servers[name];
  }
}

export function wiringToolsListSortedNames(config: ECPSystemConfig): string[] {
  const names = config.tools?.servers ? Object.keys(config.tools.servers) : [];
  return names.sort();
}

export function wiringEndpointsAdd(config: ECPSystemConfig, name: string, url: string): void {
  config.agents ??= {};
  config.agents.endpoints ??= {};
  if (config.agents.endpoints[name] !== undefined) {
    throw new Error(
      `Endpoint "${name}" already exists. Use "ecp config update --type endpoints" to change the URL.`,
    );
  }
  config.agents.endpoints[name] = { url };
}

export function wiringEndpointsMergeConfig(
  config: ECPSystemConfig,
  name: string,
  extra: Record<string, unknown>,
): void {
  const cur = config.agents?.endpoints?.[name];
  if (!cur) return;
  if (typeof cur === "string") {
    config.agents!.endpoints![name] = { url: cur, ...extra };
    return;
  }
  if (cur && typeof cur === "object") {
    Object.assign(cur as unknown as Record<string, unknown>, extra);
  }
}

export function wiringEndpointsUpdateUrl(config: ECPSystemConfig, name: string, url: string): void {
  config.agents ??= {};
  config.agents.endpoints ??= {};
  if (config.agents.endpoints[name] === undefined) {
    throw new Error(`No endpoint "${name}". Use "ecp config add --type endpoints" first.`);
  }
  const cur = config.agents.endpoints[name];
  if (typeof cur === "string") {
    config.agents.endpoints[name] = { url };
  } else if (cur && typeof cur === "object") {
    (cur as { url: string }).url = url;
  }
}

export function wiringEndpointsRemove(config: ECPSystemConfig, name: string): void {
  if (config.agents?.endpoints && name in config.agents.endpoints) {
    delete config.agents.endpoints[name];
  }
}

export function wiringEndpointsFormatLines(config: ECPSystemConfig): string[] {
  const ae = config.agents?.endpoints;
  if (!ae || Object.keys(ae).length === 0) return [];
  const lines: string[] = [];
  for (const k of Object.keys(ae).sort()) {
    const v = ae[k];
    const url =
      typeof v === "string"
        ? v
        : v && typeof v === "object" && typeof (v as { url?: string }).url === "string"
          ? (v as { url: string }).url
          : "(invalid entry)";
    lines.push(`${k}: ${url}`);
  }
  return lines;
}

export function wiringLoggersAdd(config: ECPSystemConfig, id: string, blob: Record<string, unknown>): void {
  config.loggers ??= {};
  config.loggers.config ??= {};
  if (config.loggers.config[id] !== undefined) {
    throw new Error(
      `Logger config "${id}" already exists. Use "ecp config update --type loggers" to replace it.`,
    );
  }
  config.loggers.config[id] = blob;
}

export function wiringLoggersUpdate(config: ECPSystemConfig, id: string, blob: Record<string, unknown>): void {
  config.loggers ??= {};
  config.loggers.config ??= {};
  if (config.loggers.config[id] === undefined) {
    throw new Error(`No logger config "${id}". Use "ecp config add --type loggers" first.`);
  }
  config.loggers.config[id] = blob;
}

export function wiringLoggersRemove(config: ECPSystemConfig, id: string): void {
  config.loggers ??= {};
  config.loggers.config ??= {};
  if (config.loggers.config[id] !== undefined) {
    delete config.loggers.config[id];
  }
}

export function wiringLoggersListSortedIds(config: ECPSystemConfig): string[] {
  const keys = config.loggers?.config ? Object.keys(config.loggers.config) : [];
  return keys.sort();
}

export function wiringModelsAddProvider(
  config: ECPSystemConfig,
  providerId: string,
  patch: Record<string, unknown>,
): void {
  config.models ??= {};
  config.models.providers ??= {};
  if (config.models.providers[providerId] !== undefined) {
    throw new Error(
      `Provider "${providerId}" already exists. Use "ecp config update --type models" to change it.`,
    );
  }
  config.models.providers[providerId] = mergeModelProviderBlock(undefined, patch);
}

export function wiringModelsUpdateProvider(
  config: ECPSystemConfig,
  providerId: string,
  patch: Record<string, unknown>,
): void {
  config.models ??= {};
  config.models.providers ??= {};
  if (config.models.providers[providerId] === undefined) {
    throw new Error(`No provider "${providerId}". Use "ecp config add --type models" first.`);
  }
  const cur = config.models.providers[providerId]!;
  config.models.providers[providerId] = mergeModelProviderBlock(cur, patch);
}

export function wiringModelsRemoveProvider(config: ECPSystemConfig, providerId: string): void {
  config.models ??= {};
  config.models.providers ??= {};
  if (providerId in config.models.providers) {
    delete config.models.providers[providerId];
  }
}

/** Human-readable summary of models.providers (no provider-specific branches). */
export function formatModelsWiringSummary(config: ECPSystemConfig): string {
  const mp = config.models?.providers;
  const lines: string[] = [];
  if (!mp || Object.keys(mp).length === 0) {
    return "(no model providers configured)\n";
  }
  for (const key of Object.keys(mp).sort()) {
    const block = mp[key];
    lines.push(`${key}:`);
    if (!block) {
      lines.push("  (empty)\n");
      continue;
    }
    if (block.defaultModel) lines.push(`  defaultModel: ${block.defaultModel}`);
    if (block.supportedModels?.length) lines.push(`  supportedModels: ${block.supportedModels.join(", ")}`);
    if (block.config && Object.keys(block.config).length > 0) {
      lines.push(`  config: ${JSON.stringify(block.config)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
