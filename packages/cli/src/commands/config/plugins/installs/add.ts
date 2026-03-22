import { Args, Command, Flags } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

/**
 * Records install metadata in YAML. Does not run npm/git — run your package manager separately,
 * then set `--path` to the unpacked directory.
 */
export default class ConfigPluginsInstallsAdd extends Command {
  static summary = "Add or replace plugins.installs.<id> (metadata only; no network install)";

  static args = {
    id: Args.string({ required: true, description: "Stable id for this install (e.g. filesystem)" }),
  };

  static flags = {
    ...configScopeFlags,
    npm: Flags.string({
      description: 'NPM package spec (sets source.type "npm" and source.spec)',
    }),
    path: Flags.string({
      description: "Filesystem path to the installed plugin directory",
    }),
    kind: Flags.string({
      description: 'pluginKind metadata (e.g. "tool")',
      default: "tool",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsInstallsAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const npmSpec = flags.npm as string | undefined;
    const fsPath = flags.path as string | undefined;
    if (!npmSpec) {
      this.error("Provide --npm <package-spec> (metadata only for now).", { exit: 1 });
    }

    config.plugins ??= {};
    config.plugins.installs ??= {};
    config.plugins.installs[args.id] = {
      source: { type: "npm", spec: npmSpec },
      path: fsPath,
      pluginKind: flags.kind as string,
      config: {},
    };

    persistConfig(path, config);
    this.log(`Wrote plugins.installs.${args.id} (${path})`);
  }
}
