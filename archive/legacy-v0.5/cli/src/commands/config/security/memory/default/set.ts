import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityMemoryDefaultSet extends Command {
  static summary = "Set security.memory.defaultStore";

  static args = {
    id: Args.string({ required: true, description: "Memory store id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityMemoryDefaultSet);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.memory ??= {};
    sec.memory.defaultStore = args.id;

    persistConfig(path, config);
    this.log(`Set security.memory.defaultStore = ${args.id} (${path})`);
  }
}
