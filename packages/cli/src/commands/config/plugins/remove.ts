import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { Args, Command, Flags } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { resolvePluginDataRoot, resolvePluginInstallDir } from "../../../lib/plugin-install.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

/**
 * Remove one `plugins.installs.<id>` entry from system config.
 *
 * @category CLI
 */
export default class ConfigPluginsRemove extends Command {
  static summary = "Remove a plugins.installs.<id> entry";

  static args = {
    id: Args.string({ required: true, description: "Install id (key under plugins.installs)" }),
  };

  static flags = {
    ...configScopeFlags,
    clean: Flags.boolean({
      description: "Delete installed plugin files from disk (when path is under the managed .ecp/plugins root)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.plugins ??= {};
    config.plugins.installs ??= {};
    const existing = config.plugins.installs[args.id];
    let cleanedPath: string | undefined;

    if ((flags.clean as boolean) && existing) {
      const managedRoot = resolvePluginDataRoot(cwd, flags.global as boolean);
      const expectedDir = resolvePluginInstallDir(cwd, flags.global as boolean, args.id);
      const candidatePath =
        typeof existing.path === "string" && existing.path.trim().length > 0 ? existing.path : expectedDir;
      const absoluteCandidate = resolve(candidatePath);
      const absoluteManagedRoot = resolve(managedRoot);
      const absoluteExpectedDir = resolve(expectedDir);
      const underManagedRoot =
        absoluteCandidate === absoluteManagedRoot ||
        absoluteCandidate.startsWith(`${absoluteManagedRoot}${sep}`);
      const safeToDelete = absoluteCandidate === absoluteExpectedDir || underManagedRoot;

      if (!safeToDelete) {
        this.warn(
          `Skipped deleting "${absoluteCandidate}" because it is outside the managed plugin root "${absoluteManagedRoot}".`,
        );
      } else if (existsSync(absoluteCandidate)) {
        rmSync(absoluteCandidate, { recursive: true, force: true });
        cleanedPath = absoluteCandidate;
      }
    }

    if (args.id in config.plugins.installs) {
      delete config.plugins.installs[args.id];
    }

    persistConfig(path, config);
    this.log(`Removed plugins.installs.${args.id} (${path})`);
    if (cleanedPath) {
      this.log(`Deleted plugin files at ${cleanedPath}`);
    }
  }
}
