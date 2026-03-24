/**
 * Load dynamic plugin packages from `plugins.installs` paths into an {@link ExtensionRegistry}.
 *
 * @category Extensions
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { EcpPluginManifest, PackageJsonWithEcp } from "@executioncontrolprotocol/spec";
import {
  assertEcpPluginManifest,
  coercePluginInstallSource,
  getEcpManifestFromPackageJson,
  resolveManifestPluginKind,
} from "@executioncontrolprotocol/spec";

import type { ECPSystemConfig } from "../engine/types.js";
import { assertPluginPermittedByPolicy } from "../engine/plugin-security.js";
import { getSecurityConfig } from "../engine/system-config-loader.js";
import type { ExtensionRegistry } from "./registry.js";

const ECP_PLUGIN_JSON = "ecp-plugin.json";

function loadManifest(packageRoot: string): EcpPluginManifest {
  const pkgPath = join(packageRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJsonWithEcp;
    const fromPkg = getEcpManifestFromPackageJson(pkg);
    if (fromPkg) {
      assertEcpPluginManifest(fromPkg);
      return fromPkg;
    }
  }
  const standalone = join(packageRoot, ECP_PLUGIN_JSON);
  if (existsSync(standalone)) {
    const raw: unknown = JSON.parse(readFileSync(standalone, "utf8"));
    assertEcpPluginManifest(raw);
    return raw;
  }
  throw new Error(`No ECP plugin manifest found under "${packageRoot}".`);
}

/**
 * Import each non-builtin install with an `entry.module` and invoke its register function.
 * Skips `tool` plugins (MCP wiring only) and entries without `entry`.
 *
 * @category Extensions
 */
export async function registerDynamicPluginsFromInstalls(
  registry: ExtensionRegistry,
  systemConfig: ECPSystemConfig,
): Promise<void> {
  const installs = systemConfig.plugins?.installs ?? {};
  const policy = getSecurityConfig(systemConfig)?.plugins;
  for (const [, entry] of Object.entries(installs)) {
    const root = entry.path;
    if (!root) continue;
    const source = coercePluginInstallSource(entry.source);
    if (!source || source.type === "builtin") continue;

    const manifest = loadManifest(root);
    assertPluginPermittedByPolicy(manifest, source, policy);

    const effective = resolveManifestPluginKind(manifest);
    if (effective === "tool") {
      continue;
    }
    if (!manifest.entry?.module?.trim()) {
      throw new Error(
        `Dynamic plugin "${manifest.id}" is missing entry.module (required for kind "${effective}").`,
      );
    }
    const modPath = join(root, manifest.entry.module);
    if (!existsSync(modPath)) {
      throw new Error(`Plugin entry file missing: ${modPath}`);
    }
    const href = pathToFileURL(modPath).href;
    const mod = await import(href);
    const exportName = manifest.entry.export?.trim();
    const fn = exportName
      ? (mod as Record<string, unknown>)[exportName]
      : (mod as { register?: unknown; default?: unknown }).register ??
        (mod as { default?: unknown }).default;
    if (typeof fn !== "function") {
      throw new Error(
        `Plugin "${manifest.id}" must export a register function (named "register", default export, or entry.export).`,
      );
    }
    (fn as (r: ExtensionRegistry) => void)(registry);
  }
}
