import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityAgentsAllowRemove extends Command {
  static summary = "Remove an endpoint name from security.agents.allowEndpoints";

  static args = {
    name: Args.string({ required: true, description: "agents.endpoints key" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityAgentsAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.agents ??= {};
    sec.agents.allowEndpoints = removeId(sec.agents.allowEndpoints, args.name);
    sec.agents.defaultEnable = removeId(sec.agents.defaultEnable, args.name);

    persistConfig(path, config);
    this.log(
      `Updated security.agents.allowEndpoints (${path}): ${sec.agents.allowEndpoints?.join(", ") ?? "(empty)"}`,
    );
  }
}
