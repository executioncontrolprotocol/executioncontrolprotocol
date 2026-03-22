import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../lib/system-config-cli.js";

export default class ConfigLoggersDefaultAdd extends Command {
  static summary = "Add a logger ID to security.loggers.defaultEnable";

  static args = {
    id: Args.string({ required: true, description: "Logger ID" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigLoggersDefaultAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.loggers ??= {};
    sec.loggers.defaultEnable = addUnique(sec.loggers.defaultEnable, args.id);
    if (sec.loggers.allowEnable && sec.loggers.allowEnable.length > 0) {
      sec.loggers.allowEnable = addUnique(sec.loggers.allowEnable, args.id);
    }

    persistConfig(path, config);
    this.log(`Updated security.loggers.defaultEnable (${path}): ${sec.loggers.defaultEnable?.join(", ")}`);
  }
}
