import type {
  ExtensionSourceType,
  PluginKind,
  PluginSecurityPolicy,
} from "@executioncontrolprotocol/spec";
import { PLUGIN_KINDS } from "@executioncontrolprotocol/spec";

import { splitCommaSeparated } from "./parsing.js";

const EXTENSION_SOURCE_TYPES: readonly ExtensionSourceType[] = ["builtin", "npm", "git", "local"];

/**
 * Parse repeatable `--option key=value` flags; duplicate keys are rejected.
 *
 * @category Config CLI
 */
export function parseUniqueOptionFlags(
  raw: string[] | undefined,
  flagName = "--option",
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const kv of raw ?? []) {
    const eqIdx = kv.indexOf("=");
    if (eqIdx === -1) {
      throw new Error(`Invalid ${flagName} value "${kv}" (expected key=value).`);
    }
    const key = kv.slice(0, eqIdx).trim();
    const valueRaw = kv.slice(eqIdx + 1);
    if (!key) {
      throw new Error(`Invalid ${flagName} value "${kv}" (missing key).`);
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error(`Duplicate ${flagName} key "${key}".`);
    }
    if (valueRaw === "true") out[key] = true;
    else if (valueRaw === "false") out[key] = false;
    else if (!isNaN(Number(valueRaw)) && valueRaw !== "") out[key] = Number(valueRaw);
    else out[key] = valueRaw;
  }
  return out;
}

/**
 * Build a {@link ModelProviderConfig}-shaped patch from CLI flags (no `--file`).
 *
 * @category Config CLI
 */
export function buildModelProviderPatchFromFlags(options: {
  defaultModel?: string;
  supportedModelsRaw?: string[];
  optionFlags?: string[];
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (options.defaultModel !== undefined) {
    patch.defaultModel = options.defaultModel;
  }
  const supported = splitCommaSeparated(options.supportedModelsRaw);
  if (supported.length > 0) {
    patch.supportedModels = supported;
  }
  if (options.defaultModel !== undefined) {
    const cur = patch.supportedModels as string[] | undefined;
    if (!cur || cur.length === 0) {
      patch.supportedModels = [options.defaultModel];
    } else if (!cur.includes(options.defaultModel)) {
      patch.supportedModels = [...cur, options.defaultModel];
    }
  }
  const opts = parseUniqueOptionFlags(options.optionFlags);
  if (Object.keys(opts).length > 0) {
    patch.config = opts;
  }
  return patch;
}

/**
 * Build a {@link PluginSecurityPolicy} from CLI flags (no `--file`).
 *
 * @category Config CLI
 */
export function buildPluginSecurityPolicyFromFlags(options: {
  allowKind?: string[];
  allowSourceType?: string[];
  allowId?: string[];
  denyId?: string[];
  strict?: boolean;
}): PluginSecurityPolicy {
  const policy: PluginSecurityPolicy = {};
  if (options.allowKind?.length) {
    const kinds: PluginKind[] = [];
    for (const k of options.allowKind) {
      if (!(PLUGIN_KINDS as readonly string[]).includes(k)) {
        throw new Error(
          `Invalid --allow-kind "${k}" (expected one of: ${PLUGIN_KINDS.join(", ")}).`,
        );
      }
      kinds.push(k as PluginKind);
    }
    policy.allowKinds = kinds;
  }
  if (options.allowSourceType?.length) {
    const st: ExtensionSourceType[] = [];
    for (const s of options.allowSourceType) {
      if (!(EXTENSION_SOURCE_TYPES as readonly string[]).includes(s)) {
        throw new Error(
          `Invalid --allow-source-type "${s}" (expected one of: ${EXTENSION_SOURCE_TYPES.join(", ")}).`,
        );
      }
      st.push(s as ExtensionSourceType);
    }
    policy.allowSourceTypes = st;
  }
  if (options.allowId?.length) {
    policy.allowIds = [...options.allowId];
  }
  if (options.denyId?.length) {
    policy.denyIds = [...options.denyId];
  }
  if (options.strict !== undefined) {
    policy.strict = options.strict;
  }
  return policy;
}

/**
 * Build tool server entry from structured flags (stdio/sse) plus `--option` and optional credentials file JSON.
 *
 * @category Config CLI
 */
export function buildToolServerEntryFromFlags(options: {
  transportType: "stdio" | "sse";
  stdioCommand?: string;
  stdioArg?: string[];
  stdioCwd?: string;
  sseUrl?: string;
  optionFlags?: string[];
  credentialsJson?: unknown;
}): { transport: Record<string, unknown>; credentials?: unknown; config?: Record<string, unknown> } {
  let transport: Record<string, unknown>;
  if (options.transportType === "stdio") {
    if (!options.stdioCommand?.trim()) {
      throw new Error('Provide --stdio-command for --transport-type stdio.');
    }
    const args = splitCommaSeparated(options.stdioArg);
    transport = {
      type: "stdio",
      command: options.stdioCommand,
      args,
    };
    if (options.stdioCwd?.trim()) {
      transport.cwd = options.stdioCwd;
    }
  } else {
    if (!options.sseUrl?.trim()) {
      throw new Error('Provide --sse-url for --transport-type sse.');
    }
    transport = {
      type: "sse",
      url: options.sseUrl,
    };
  }

  const entry: {
    transport: Record<string, unknown>;
    credentials?: unknown;
    config?: Record<string, unknown>;
  } = { transport };

  const cfg = parseUniqueOptionFlags(options.optionFlags);
  if (Object.keys(cfg).length > 0) {
    entry.config = cfg as Record<string, unknown>;
  }

  if (options.credentialsJson !== undefined) {
    if (!options.credentialsJson || typeof options.credentialsJson !== "object") {
      throw new Error("Credentials file must contain a JSON object.");
    }
    entry.credentials = options.credentialsJson as { bindings?: unknown[] };
  }

  return entry;
}
