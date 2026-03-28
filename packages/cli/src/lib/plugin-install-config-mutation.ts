import type { Command } from "@oclif/core";
import { Args, Flags } from "@oclif/core";

import { configScopeFlags } from "./config-flags.js";
import { persistConfig, readForMutation } from "./system-config-cli.js";
import {
  applyManifestWiringToSystemConfig,
  buildPluginInstallEntry,
  coercePluginInstallSource,
  materializePluginArtifact,
  runPluginInstallHook,
} from "./plugin-install.js";
import { PLUGIN_KINDS, type PluginInstallSource, type PluginKind } from "@executioncontrolprotocol/spec";

/**
 * Oclif `args` for `ecp config plugins add` and `ecp config plugins update`.
 *
 * @category CLI
 */
export const pluginInstallConfigArgs = {
  id: Args.string({ required: true, description: "Stable id for this install (must match manifest id)" }),
};

/**
 * Oclif `flags` for `ecp config plugins add` and `ecp config plugins update`.
 *
 * @category CLI
 */
export const pluginInstallConfigFlags = {
  ...configScopeFlags,
  npm: Flags.string({
    description: 'NPM package spec (sets source.type "npm" and source.spec)',
  }),
  git: Flags.string({
    description: 'Git repository URL (sets source.type "git")',
  }),
  "git-ref": Flags.string({
    description: "Optional git branch or tag (with --git)",
  }),
  local: Flags.string({
    description: 'Local directory path (sets source.type "local")',
  }),
  path: Flags.string({
    description: "Filesystem path to an already-installed plugin directory (metadata-only; skips fetch)",
  }),
  install: Flags.boolean({
    description: "Download or copy the artifact, run install hooks, merge wiring, and write plugins.installs",
    default: false,
  }),
  upgrade: Flags.boolean({
    description: "For update: re-fetch using the existing source (npm/git) and replace installed files",
    default: false,
  }),
  force: Flags.boolean({
    description: "Replace existing install directory when using --install",
    default: false,
  }),
  kind: Flags.string({
    description: `pluginKind for metadata-only installs (${PLUGIN_KINDS.join(", ")})`,
    options: [...PLUGIN_KINDS],
  }),
};

function parseSource(flags: {
  npm?: string;
  git?: string;
  "git-ref"?: string;
  local?: string;
}): PluginInstallSource {
  const n = flags.npm?.trim();
  const g = flags.git?.trim();
  const l = flags.local?.trim();
  const count = [n, g, l].filter(Boolean).length;
  if (count !== 1) {
    throw new Error('Provide exactly one of --npm, --git, or --local (unless using metadata-only mode without --install).');
  }
  if (n) return { type: "npm", spec: n };
  if (g) return { type: "git", url: g, ref: flags["git-ref"]?.trim() || undefined };
  return { type: "local", path: l! };
}

function resolveUpgradeSource(command: Command, args: { id: string }, flags: { npm?: string; git?: string; local?: string }, config: { plugins?: { installs?: Record<string, { source?: PluginInstallSource }> } }): PluginInstallSource {
  if (flags.npm || flags.git || flags.local) {
    command.error("Do not combine --upgrade with --npm, --git, or --local. --upgrade uses the existing source.", {
      exit: 1,
    });
  }
  const existing = config.plugins?.installs?.[args.id];
  if (!existing?.source) {
    command.error(
      `Cannot upgrade plugins.installs.${args.id}: no existing source found. Add it first with \`ecp config plugins add\`.`,
      { exit: 1 },
    );
  }
  if (existing.source.type !== "npm" && existing.source.type !== "git") {
    command.error("--upgrade only supports existing npm or git installs.", { exit: 1 });
  }
  return existing.source;
}

/**
 * Writes or replaces `plugins.installs.<id>` (metadata-only or full `--install` flow).
 *
 * @category CLI
 */
export async function runPluginInstallConfigMutation(
  command: Command,
  args: { id: string },
  flags: {
    global?: boolean;
    config?: string;
    npm?: string;
    git?: string;
    "git-ref"?: string;
    local?: string;
    path?: string;
    install?: boolean;
    upgrade?: boolean;
    force?: boolean;
    kind?: string;
  },
): Promise<void> {
  const cwd = process.cwd();
  const { path: configPath, config } = readForMutation({
    global: flags.global as boolean,
    cwd,
    explicit: flags.config as string | undefined,
  });

  const upgrade = flags.upgrade as boolean;
  const doInstall = (flags.install as boolean) || upgrade;

  if (doInstall) {
    const source = upgrade
      ? resolveUpgradeSource(
          command,
          args,
          flags as { npm?: string; git?: string; local?: string },
          config as { plugins?: { installs?: Record<string, { source?: PluginInstallSource }> } },
        )
      : parseSource(flags as { npm?: string; git?: string; "git-ref"?: string; local?: string });
    const { packageRoot, manifest, source: src } = materializePluginArtifact({
      cwd,
      global: flags.global as boolean,
      installId: args.id,
      source,
      force: (flags.force as boolean) || upgrade,
      systemConfig: config,
    });
    runPluginInstallHook(packageRoot, manifest);
    applyManifestWiringToSystemConfig(config, manifest, {});
    config.plugins ??= {};
    config.plugins.installs ??= {};
    config.plugins.installs[args.id] = buildPluginInstallEntry({
      packageRoot,
      manifest,
      source: src,
    });
    persistConfig(configPath, config);
    command.log(`Installed plugin "${args.id}" at ${packageRoot}`);
    command.log(`Updated ${configPath}`);
    command.log(
      "Next: ensure security policy allows this plugin, e.g. `ecp config security plugins update --allow-id " +
        args.id +
        "` and per-area allow lists (tools, models, loggers, …) as needed.",
    );
    return;
  }

  const npmSpec = flags.npm as string | undefined;
  const fsPath = flags.path as string | undefined;
  if (!npmSpec && !flags.git && !flags.local) {
    command.error("Provide --npm, --git, or --local (or use --install with one of those).", { exit: 1 });
  }
  if (flags.git || flags.local) {
    command.error("Without --install, only --npm is supported for metadata-only recording.", { exit: 1 });
  }

  config.plugins ??= {};
  config.plugins.installs ??= {};
  const rawSource: Record<string, unknown> = { type: "npm", spec: npmSpec! };
  const coerced = coercePluginInstallSource(rawSource);
  if (!coerced) {
    command.error("Invalid source shape.", { exit: 1 });
  }
  const pluginKind = (flags.kind as PluginKind | undefined) ?? ("tool" as PluginKind);
  config.plugins.installs[args.id] = {
    source: coerced,
    path: fsPath,
    pluginKind,
    config: {},
  };

  persistConfig(configPath, config);
  command.log(`Wrote plugins.installs.${args.id} (${configPath})`);
}
