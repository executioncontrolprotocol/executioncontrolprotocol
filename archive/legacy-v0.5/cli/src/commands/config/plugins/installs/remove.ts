import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

export default class ConfigPluginsInstallsRemove extends Command {
  static summary = "Remove a plugins.installs.<id> entry";

  static args = {
    id: Args.string({ required: true, description: "Install id (key under plugins.installs)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsInstallsRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.plugins ??= {};
    config.plugins.installs ??= {};
    if (args.id in config.plugins.installs) {
      delete config.plugins.installs[args.id];
    }

    persistConfig(path, config);
    this.log(`Removed plugins.installs.${args.id} (${path})`);
  }
}
