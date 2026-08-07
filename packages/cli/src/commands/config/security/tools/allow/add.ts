import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityToolsAllowAdd extends Command {
  static summary = "Add a tool server name to security.tools.allowServers";

  static args = {
    name: Args.string({ required: true, description: "Logical server name (tools.servers key)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityToolsAllowAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.tools ??= {};
    sec.tools.allowServers = addUnique(sec.tools.allowServers, args.name);

    persistConfig(path, config);
    this.log(`Updated security.tools.allowServers (${path}): ${sec.tools.allowServers?.join(", ")}`);
  }
}
