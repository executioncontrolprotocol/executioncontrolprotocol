import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityMemoryAllowAdd extends Command {
  static summary = "Add a store id to security.memory.allowStores";

  static args = {
    id: Args.string({ required: true, description: "Memory store id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityMemoryAllowAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.memory ??= {};
    sec.memory.allowStores = addUnique(sec.memory.allowStores, args.id);

    persistConfig(path, config);
    this.log(`Updated security.memory.allowStores (${path}): ${sec.memory.allowStores?.join(", ")}`);
  }
}
