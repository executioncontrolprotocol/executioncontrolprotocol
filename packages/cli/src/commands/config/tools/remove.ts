import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigToolsRemove extends Command {
  static summary = "Remove an MCP tool server entry (disable tool wiring)";

  static args = {
    name: Args.string({ required: true, description: "Logical server name" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigToolsRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    if (config.tools?.servers && args.name in config.tools.servers) {
      delete config.tools.servers[args.name];
    }

    persistConfig(path, config);
    this.log(`Removed tool server "${args.name}" (${path})`);
  }
}
