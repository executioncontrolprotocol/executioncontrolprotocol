import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityExecutorsDefaultAdd extends Command {
  static summary = "Add an executor id to security.executors.defaultEnable";

  static args = {
    id: Args.string({ required: true, description: "Executor instance id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityExecutorsDefaultAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.executors ??= {};
    sec.executors.defaultEnable = addUnique(sec.executors.defaultEnable, args.id);
    if (sec.executors.allowExecutors && sec.executors.allowExecutors.length > 0) {
      sec.executors.allowExecutors = addUnique(sec.executors.allowExecutors, args.id);
    }

    persistConfig(path, config);
    this.log(`Updated security.executors.defaultEnable (${path}): ${sec.executors.defaultEnable?.join(", ")}`);
  }
}
