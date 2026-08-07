import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityAgentsDefaultAdd extends Command {
  static summary = "Add an endpoint name to security.agents.defaultEnable";

  static args = {
    name: Args.string({ required: true, description: "agents.endpoints key" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityAgentsDefaultAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.agents ??= {};
    sec.agents.defaultEnable = addUnique(sec.agents.defaultEnable, args.name);
    if (sec.agents.allowEndpoints && sec.agents.allowEndpoints.length > 0) {
      sec.agents.allowEndpoints = addUnique(sec.agents.allowEndpoints, args.name);
    }

    persistConfig(path, config);
    this.log(`Updated security.agents.defaultEnable (${path}): ${sec.agents.defaultEnable?.join(", ")}`);
  }
}
