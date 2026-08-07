import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityToolsAllowRemove extends Command {
  static summary = "Remove a tool server name from security.tools.allowServers";

  static args = {
    name: Args.string({ required: true, description: "Logical server name" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityToolsAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.tools ??= {};
    sec.tools.allowServers = removeId(sec.tools.allowServers, args.name);

    persistConfig(path, config);
    this.log(
      `Updated security.tools.allowServers (${path}): ${sec.tools.allowServers?.join(", ") ?? "(empty)"}`,
    );
  }
}
