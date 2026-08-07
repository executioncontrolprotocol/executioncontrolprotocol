import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityExecutorsAllowAdd extends Command {
  static summary = "Add an executor id to security.executors.allowExecutors";

  static args = {
    id: Args.string({ required: true, description: "Executor instance id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityExecutorsAllowAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.executors ??= {};
    sec.executors.allowExecutors = addUnique(sec.executors.allowExecutors, args.id);

    persistConfig(path, config);
    this.log(`Updated security.executors.allowExecutors (${path}): ${sec.executors.allowExecutors?.join(", ")}`);
  }
}
