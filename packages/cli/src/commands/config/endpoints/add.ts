import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigEndpointsAdd extends Command {
  static summary = "Set agents.endpoints.<executorName>.url (A2A)";

  static args = {
    name: Args.string({ required: true, description: "Executor / specialist name" }),
    url: Args.string({ required: true, description: "A2A endpoint URL" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigEndpointsAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.agents ??= {};
    config.agents.endpoints ??= {};
    if (config.agents.endpoints[args.name] !== undefined) {
      this.error(
        `Endpoint "${args.name}" already exists. Use "ecp config endpoints update" to change the URL.`,
        { exit: 1 },
      );
    }
    config.agents.endpoints[args.name] = { url: args.url };

    persistConfig(path, config);
    this.log(`Added agents.endpoints.${args.name}.url = ${args.url} (${path})`);
  }
}
