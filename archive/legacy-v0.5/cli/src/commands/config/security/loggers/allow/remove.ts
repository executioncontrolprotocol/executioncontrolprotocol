import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityLoggersAllowRemove extends Command {
  static summary = "Remove a logger id from security.loggers.allowEnable and defaultEnable";

  static args = {
    id: Args.string({ required: true, description: "Logger id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityLoggersAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.loggers ??= {};
    sec.loggers.allowEnable = removeId(sec.loggers.allowEnable, args.id);
    sec.loggers.defaultEnable = removeId(sec.loggers.defaultEnable, args.id);

    persistConfig(path, config);
    this.log(`Removed "${args.id}" from logger allow/default lists. ${path}`);
  }
}
