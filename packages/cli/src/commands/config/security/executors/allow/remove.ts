import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityExecutorsAllowRemove extends Command {
  static summary = "Remove an executor id from security.executors.allowExecutors";

  static args = {
    id: Args.string({ required: true, description: "Executor instance id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityExecutorsAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.executors ??= {};
    sec.executors.allowExecutors = removeId(sec.executors.allowExecutors, args.id);
    sec.executors.defaultEnable = removeId(sec.executors.defaultEnable, args.id);

    persistConfig(path, config);
    this.log(
      `Updated security.executors.allowExecutors (${path}): ${sec.executors.allowExecutors?.join(", ") ?? "(empty)"}`,
    );
  }
}
