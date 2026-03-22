import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigEndpointsRemove extends Command {
  static summary = "Remove an agents.endpoints entry";

  static args = {
    name: Args.string({ required: true, description: "Executor / specialist name" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigEndpointsRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    if (config.agents?.endpoints && args.name in config.agents.endpoints) {
      delete config.agents.endpoints[args.name];
    }

    persistConfig(path, config);
    this.log(`Removed agents.endpoints.${args.name} (${path})`);
  }
}
