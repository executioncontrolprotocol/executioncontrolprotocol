import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigEndpointsUpdate extends Command {
  static summary = "Update agents.endpoints.<executorName>.url";

  static description = "Same as add: sets the URL for an executor name (creates or overwrites).";

  static args = {
    name: Args.string({ required: true, description: "Executor / specialist name" }),
    url: Args.string({ required: true, description: "A2A endpoint URL" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigEndpointsUpdate);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.agents ??= {};
    config.agents.endpoints ??= {};
    if (config.agents.endpoints[args.name] === undefined) {
      this.error(
        `No endpoint "${args.name}". Use "ecp config endpoints add" first.`,
        { exit: 1 },
      );
    }
    const cur = config.agents.endpoints[args.name];
    if (typeof cur === "string") {
      config.agents.endpoints[args.name] = { url: args.url };
    } else if (cur && typeof cur === "object") {
      cur.url = args.url;
    }

    persistConfig(path, config);
    this.log(`Updated agents.endpoints.${args.name}.url = ${args.url} (${path})`);
  }
}
