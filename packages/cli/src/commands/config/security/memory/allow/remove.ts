import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityMemoryAllowRemove extends Command {
  static summary = "Remove a store id from security.memory.allowStores";

  static args = {
    id: Args.string({ required: true, description: "Memory store id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityMemoryAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.memory ??= {};
    sec.memory.allowStores = removeId(sec.memory.allowStores, args.id);
    if (sec.memory.defaultStore === args.id) {
      delete sec.memory.defaultStore;
    }

    persistConfig(path, config);
    this.log(
      `Updated security.memory.allowStores (${path}): ${sec.memory.allowStores?.join(", ") ?? "(empty)"}`,
    );
  }
}
