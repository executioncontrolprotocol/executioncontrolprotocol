/**
 * ECP plugin package manifest (package.json `ecp` field or `ecp-plugin.json`).
 *
 * @category Plugins
 */

import {
  PLUGIN_KINDS,
  type ExtensionSourceType,
  type PluginKind,
  type ResolvedPluginKind,
} from "./ecp.js";

/**
 * Discriminated install source for persisted `plugins.installs` records.
 *
 * @category Plugins
 */
export type PluginInstallSource =
  | {
      /** NPM package spec (name, name@version, or tarball reference). */
      type: "npm";
      spec: string;
    }
  | {
      /** Git clone URL; optional ref (branch, tag, commit). */
      type: "git";
      url: string;
      ref?: string;
    }
  | {
      /** Local directory or archive path on disk. */
      type: "local";
      path: string;
    }
  | {
      /** Built-in distribution (metadata only). */
      type: "builtin";
      spec?: string;
    };

/**
 * Hook commands invoked during install (shell; run with cwd = unpacked root).
 *
 * @category Plugins
 */
export interface EcpPluginHooks {
  /**
   * Install hook: npm script name (e.g. `ecp-install`) or shell command string.
   */
  install?: string;
}

/**
 * Wiring template merged into system config when `ecp config plugins installs add --install` runs.
 *
 * @category Plugins
 */
export interface EcpPluginWiring {
  /** Fragment merged under `tools.servers.<serverName>`. */
  tool?: {
    /** Logical MCP server key (must match Context mount `from.server`). */
    serverName: string;
    /** Transport + optional `config` / `credentials` shapes (engine-validated at runtime). */
    server: Record<string, unknown>;
  };

  /** Fragment merged under `models.providers.<id>`. */
  provider?: Record<string, unknown>;

  /** Fragment merged under `executors.instances.<id>`. */
  executor?: Record<string, unknown>;

  /** Fragment merged under `memory.stores.<id>`. */
  memory?: Record<string, unknown>;

  /** Fragment merged under `loggers.config.<id>`. */
  logger?: Record<string, unknown>;
}

/**
 * Module path for the ESM entry that registers the plugin (relative to package root).
 *
 * @category Plugins
 */
export interface EcpPluginEntry {
  /**
   * Relative path to the ESM module (e.g. `dist/register.js`).
   */
  module: string;

  /**
   * Optional named export to load (`register` if omitted).
   */
  export?: string;
}

/**
 * Root manifest carried in `package.json` under the `ecp` key or in `ecp-plugin.json`.
 *
 * @category Plugins
 */
export interface EcpPluginManifest extends Record<string, unknown> {
  /**
   * Manifest schema version (e.g. `"1"`).
   */
  schemaVersion: string;

  /**
   * Declared plugin kind for policy and loading. Use `"third-party"` with {@link provides}.
   */
  kind: PluginKind;

  /**
   * Stable id (must match `plugins.installs` key and security allow-lists).
   */
  id: string;

  /**
   * Optional human-readable title.
   */
  title?: string;

  /**
   * When {@link kind} is `"third-party"`, required concrete role for registration and wiring.
   */
  provides?: ResolvedPluginKind;

  /**
   * Semver range of supported `@executioncontrolprotocol/*` or ECP CLI versions.
   */
  ecpPeerRange?: string;

  /**
   * Default options merged into the relevant system config `config` blob for this install.
   */
  config?: Record<string, unknown>;

  /**
   * Wiring templates applied on install (merged into `ecp.config.yaml`).
   */
  wiring?: EcpPluginWiring;

  /**
   * ESM entry used by the runtime dynamic loader (not used for `kind: "tool"` when only MCP wiring is needed).
   */
  entry?: EcpPluginEntry;

  /**
   * Post-fetch install hooks.
   */
  hooks?: EcpPluginHooks;

  /**
   * Optional description for documentation.
   */
  description?: string;
}

/**
 * Narrow type for `package.json` including optional `ecp` manifest.
 *
 * @category Plugins
 */
export interface PackageJsonWithEcp {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  ecp?: EcpPluginManifest;
  [key: string]: unknown;
}

/**
 * Resolve the effective runtime kind for registration (unwraps `third-party` + {@link EcpPluginManifest.provides}).
 *
 * @category Plugins
 */
export function resolveManifestPluginKind(manifest: EcpPluginManifest): ResolvedPluginKind {
  if (manifest.kind === "third-party") {
    const p = manifest.provides;
    if (!p) {
      throw new Error('ECP plugin manifest: kind "third-party" requires "provides".');
    }
    return p;
  }
  return manifest.kind as ResolvedPluginKind;
}

/**
 * Read `ecp` from a parsed package.json object.
 *
 * @category Plugins
 */
export function getEcpManifestFromPackageJson(pkg: unknown): EcpPluginManifest | undefined {
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return undefined;
  const ecp = (pkg as PackageJsonWithEcp).ecp;
  if (!ecp || typeof ecp !== "object") return undefined;
  return ecp as EcpPluginManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse and validate minimal fields on an ECP plugin manifest.
 *
 * @category Plugins
 */
export function assertEcpPluginManifest(manifest: unknown): asserts manifest is EcpPluginManifest {
  if (!isRecord(manifest)) {
    throw new Error("ECP plugin manifest must be a non-null object.");
  }
  if (typeof manifest.schemaVersion !== "string" || !manifest.schemaVersion.trim()) {
    throw new Error('ECP plugin manifest requires string "schemaVersion".');
  }
  if (typeof manifest.id !== "string" || !manifest.id.trim()) {
    throw new Error('ECP plugin manifest requires string "id".');
  }
  if (typeof manifest.kind !== "string") {
    throw new Error('ECP plugin manifest requires "kind".');
  }
  if (!(PLUGIN_KINDS as readonly string[]).includes(manifest.kind)) {
    throw new Error(
      `ECP plugin manifest "kind" must be one of: ${PLUGIN_KINDS.join(", ")} (got "${String(manifest.kind)}").`,
    );
  }
  if (manifest.kind === "third-party") {
    const p = manifest.provides;
    if (typeof p !== "string" || !p.trim()) {
      throw new Error('ECP plugin manifest with kind "third-party" requires string "provides".');
    }
    const resolvedKinds = PLUGIN_KINDS.filter((k) => k !== "third-party") as readonly string[];
    if (!resolvedKinds.includes(p)) {
      throw new Error(
        `ECP plugin manifest "provides" must be one of: ${resolvedKinds.join(", ")} (got "${p}").`,
      );
    }
  }
}

/**
 * Coerce persisted `source` from system config into {@link PluginInstallSource} when possible.
 *
 * @category Plugins
 */
export function coercePluginInstallSource(raw: unknown): PluginInstallSource | undefined {
  if (!isRecord(raw)) return undefined;
  const t = raw.type;
  if (t === "npm" && typeof raw.spec === "string") {
    return { type: "npm", spec: raw.spec };
  }
  if (t === "git" && typeof raw.url === "string") {
    return { type: "git", url: raw.url, ref: typeof raw.ref === "string" ? raw.ref : undefined };
  }
  if (t === "local" && typeof raw.path === "string") {
    return { type: "local", path: raw.path };
  }
  if (t === "builtin") {
    return { type: "builtin", spec: typeof raw.spec === "string" ? raw.spec : undefined };
  }
  return undefined;
}

/**
 * Map {@link PluginInstallSource} to {@link ExtensionSourceType} for policy checks.
 *
 * @category Plugins
 */
export function extensionSourceTypeFromInstallSource(src: PluginInstallSource): ExtensionSourceType {
  return src.type;
}
