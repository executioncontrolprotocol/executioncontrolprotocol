/**
 * Fetch and wire ECP plugins into system config (`ecp config plugins installs add --install`).
 *
 * @category Config CLI
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import type { ECPSystemConfig, PluginInstallEntry } from "@executioncontrolprotocol/runtime";
import {
  assertPluginPermittedByPolicy,
  getSecurityConfig,
} from "@executioncontrolprotocol/runtime";
import type {
  EcpPluginManifest,
  PackageJsonWithEcp,
  PluginInstallSource,
} from "@executioncontrolprotocol/spec";
import {
  assertEcpPluginManifest,
  coercePluginInstallSource,
  getEcpManifestFromPackageJson,
} from "@executioncontrolprotocol/spec";

import {
  ensureSecurityToolServerAllowed,
  wiringLoggersAdd,
  wiringModelsAddProvider,
  wiringToolsAdd,
} from "./config-wiring-ops.js";

const ECP_PLUGIN_JSON = "ecp-plugin.json";

/**
 * Root directory for plugins: project `<cwd>/.ecp/plugins` or `~/.ecp/plugins`.
 *
 * @category Config CLI
 */
export function resolvePluginDataRoot(cwd: string, global: boolean): string {
  if (global) {
    return join(homedir(), ".ecp", "plugins");
  }
  return join(cwd, ".ecp", "plugins");
}

/**
 * Resolve absolute install directory for a plugin id.
 *
 * @category Config CLI
 */
export function resolvePluginInstallDir(cwd: string, global: boolean, installId: string): string {
  return resolve(join(resolvePluginDataRoot(cwd, global), installId));
}

function readJson(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as unknown;
}

function findPackageRoot(dir: string): string {
  if (existsSync(join(dir, "package.json"))) return dir;
  if (existsSync(join(dir, "package", "package.json"))) return join(dir, "package");
  return dir;
}

/**
 * Load ECP manifest from `package.json` `ecp` field or `ecp-plugin.json`.
 *
 * @category Config CLI
 */
export function loadEcpPluginManifest(packageRoot: string): EcpPluginManifest {
  const pkgPath = join(packageRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath) as PackageJsonWithEcp;
    const fromPkg = getEcpManifestFromPackageJson(pkg);
    if (fromPkg) {
      assertEcpPluginManifest(fromPkg);
      return fromPkg;
    }
  }
  const standalone = join(packageRoot, ECP_PLUGIN_JSON);
  if (existsSync(standalone)) {
    const raw = readJson(standalone);
    assertEcpPluginManifest(raw);
    return raw;
  }
  throw new Error(
    `No ECP plugin manifest found under "${packageRoot}". Add "ecp" to package.json or create ${ECP_PLUGIN_JSON}.`,
  );
}

function runCommand(cmd: string, args: string[], cwd: string): void {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${String(res.status)})`);
  }
}

function installFromGit(url: string, ref: string | undefined, destDir: string): void {
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }
  const parent = dirname(destDir);
  const name = basename(destDir);
  mkdirSync(parent, { recursive: true });
  const args = ["clone", "--depth", "1"];
  if (ref) {
    args.push("--branch", ref);
  }
  args.push(url, name);
  runCommand("git", args, parent);
}

function copyLocalTree(src: string, destDir: string): void {
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }
  mkdirSync(join(destDir, ".."), { recursive: true });
  cpSync(src, destDir, { recursive: true });
}

export interface InstallPluginOptions {
  cwd: string;
  global: boolean;
  installId: string;
  source: PluginInstallSource;
  /** When set, existing install dir is removed first. */
  force?: boolean;
  systemConfig: ECPSystemConfig;
}

/**
 * Download / copy artifact into the plugin install dir and return manifest + resolved paths.
 *
 * @category Config CLI
 */
export function materializePluginArtifact(options: InstallPluginOptions): {
  packageRoot: string;
  manifest: EcpPluginManifest;
  source: PluginInstallSource;
} {
  const destDir = resolvePluginInstallDir(options.cwd, options.global, options.installId);
  if (existsSync(destDir) && options.force) {
    rmSync(destDir, { recursive: true, force: true });
  }
  if (existsSync(destDir) && !options.force) {
    throw new Error(`Plugin install directory already exists: ${destDir}\nUse --force to replace.`);
  }
  mkdirSync(join(destDir, ".."), { recursive: true });

  if (options.source.type === "npm") {
    const tmp = join(destDir, "..", `.tmp-pack-${options.installId}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const packRes = spawnSync("npm", ["pack", options.source.spec, "--pack-destination", tmp], {
        encoding: "utf8",
        stdio: "pipe",
      });
      if (packRes.error) throw packRes.error;
      if (packRes.status !== 0) {
        throw new Error(packRes.stderr || packRes.stdout || "npm pack failed");
      }
      mkdirSync(destDir, { recursive: true });
      const extracted = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
      if (!extracted) throw new Error("npm pack produced no tarball.");
      const tgzPath = join(tmp, extracted);
      const extractRes = spawnSync("tar", ["-xzf", tgzPath, "-C", destDir], { stdio: "pipe" });
      if (extractRes.status !== 0) {
        throw new Error(
          extractRes.stderr?.toString() ||
            extractRes.stdout?.toString() ||
            "Failed to extract npm pack tarball.",
        );
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } else if (options.source.type === "git") {
    installFromGit(options.source.url, options.source.ref, destDir);
  } else if (options.source.type === "local") {
    copyLocalTree(resolve(options.source.path), destDir);
  } else {
    throw new Error("Builtin source cannot be installed from the network.");
  }

  const packageRoot = findPackageRoot(destDir);
  const manifest = loadEcpPluginManifest(packageRoot);
  if (manifest.id !== options.installId) {
    throw new Error(
      `Manifest id "${manifest.id}" does not match install id "${options.installId}". Fix the package manifest or use the matching id.`,
    );
  }

  const policy = getSecurityConfig(options.systemConfig)?.plugins;
  assertPluginPermittedByPolicy(manifest, options.source, policy);

  return { packageRoot, manifest, source: options.source };
}

/**
 * Run optional install hook (npm script name or shell string).
 *
 * @category Config CLI
 */
export function runPluginInstallHook(packageRoot: string, manifest: EcpPluginManifest): void {
  const hook = manifest.hooks?.install?.trim();
  if (!hook) return;

  const pkgPath = join(packageRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath) as PackageJsonWithEcp;
    const scripts = pkg.scripts;
    if (scripts && hook in scripts) {
      runCommand("npm", ["run", hook, "--silent"], packageRoot);
      return;
    }
  }
  runCommand(process.platform === "win32" ? "cmd.exe" : "sh", process.platform === "win32" ? ["/c", hook] : ["-c", hook], packageRoot);
}

function deepMergeConfig(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!a && !b) return undefined;
  return { ...(a ?? {}), ...(b ?? {}) };
}

/**
 * Merge manifest wiring into system config (best-effort; fails if keys already exist where add-only).
 *
 * @category Config CLI
 */
export function applyManifestWiringToSystemConfig(
  config: ECPSystemConfig,
  manifest: EcpPluginManifest,
  installConfig: Record<string, unknown> | undefined,
): void {
  const wiring = manifest.wiring;
  if (!wiring) return;

  const mergedInstallConfig = deepMergeConfig(manifest.config, installConfig);

  if (wiring.tool?.serverName && wiring.tool.server) {
    const name = wiring.tool.serverName;
    const entry = wiring.tool.server as Record<string, unknown>;
    const transport = entry.transport as Record<string, unknown> | undefined;
    if (!transport || typeof transport !== "object") {
      throw new Error(`Invalid tools wiring for "${manifest.id}": missing transport.`);
    }
    wiringToolsAdd(config, name, entry as { transport: Record<string, unknown> });
    ensureSecurityToolServerAllowed(config, name);
  }

  if (wiring.provider) {
    const pid = manifest.id;
    const patch = { ...wiring.provider } as Record<string, unknown>;
    if (mergedInstallConfig && Object.keys(mergedInstallConfig).length > 0) {
      patch.config = deepMergeConfig(
        (patch.config as Record<string, unknown> | undefined) ?? {},
        mergedInstallConfig,
      );
    }
    wiringModelsAddProvider(config, pid, patch);
  }

  if (wiring.executor) {
    config.executors ??= {};
    config.executors.instances ??= {};
    if (config.executors.instances[manifest.id]) {
      throw new Error(`Executor instance "${manifest.id}" already exists in system config.`);
    }
    const ex = wiring.executor as { config?: Record<string, unknown> };
    config.executors.instances[manifest.id] = {
      config: deepMergeConfig(ex.config, mergedInstallConfig) ?? {},
    };
  }

  if (wiring.memory) {
    config.memory ??= {};
    config.memory.stores ??= {};
    if (config.memory.stores[manifest.id]) {
      throw new Error(`Memory store "${manifest.id}" already exists in system config.`);
    }
    const mem = wiring.memory as { config?: Record<string, unknown> };
    config.memory.stores[manifest.id] = {
      config: deepMergeConfig(mem.config, mergedInstallConfig) ?? {},
    };
  }

  if (wiring.logger) {
    const blob = { ...wiring.logger } as Record<string, unknown>;
    if (mergedInstallConfig && Object.keys(mergedInstallConfig).length > 0) {
      blob.config = deepMergeConfig(blob.config as Record<string, unknown> | undefined, mergedInstallConfig);
    }
    wiringLoggersAdd(config, manifest.id, blob);
  }
}

/**
 * Persist `plugins.installs` entry with resolved absolute path.
 *
 * @category Config CLI
 */
export function buildPluginInstallEntry(options: {
  packageRoot: string;
  manifest: EcpPluginManifest;
  source: PluginInstallSource;
  version?: string;
}): PluginInstallEntry {
  const pkgJsonPath = join(options.packageRoot, "package.json");
  let version = options.version;
  if (!version && existsSync(pkgJsonPath)) {
    try {
      const pkg = readJson(pkgJsonPath) as { version?: string };
      version = typeof pkg.version === "string" ? pkg.version : undefined;
    } catch {
      version = undefined;
    }
  }
  return {
    source: options.source,
    path: options.packageRoot,
    pluginKind: options.manifest.kind,
    version,
    config: options.manifest.config ?? {},
  };
}

export { coercePluginInstallSource };
