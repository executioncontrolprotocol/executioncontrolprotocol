import { Args, Command, Flags } from "@oclif/core";

import { configScopeFlags } from "../../lib/config-flags.js";
import {
  isWiringType,
  wiringEndpointsRemove,
  wiringLoggersRemove,
  wiringModelsRemoveProvider,
  wiringToolsRemove,
} from "../../lib/config-wiring-ops.js";
import { persistConfig, readForMutation } from "../../lib/system-config-cli.js";

export default class ConfigRemove extends Command {
  static summary = "Remove wiring: tool server, model provider, logger config, or agent endpoint";

  static description = "Does not remove security.* entries; adjust policy with `ecp config security`.";

  static args = {
    name: Args.string({
      required: false,
      description: "For --type tools|loggers|endpoints: name or id to remove",
    }),
  };

  static flags = {
    ...configScopeFlags,
    type: Flags.string({
      required: true,
      description: "Wiring slice",
      options: ["tools", "models", "loggers", "endpoints"],
    }),
    provider: Flags.string({ description: "Model provider id (for --type models)" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigRemove);
    const t = flags.type as string;
    if (!isWiringType(t)) {
      this.error(`Invalid --type: ${t}`, { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    if (t === "models") {
      const providerId = flags.provider;
      if (!providerId) this.error("Provide --provider for --type models.", { exit: 1 });
      wiringModelsRemoveProvider(config, providerId);
      this.log(`Removed models.providers.${providerId} (${path})`);
    } else {
      const name = args.name;
      if (!name) this.error("Provide <name> to remove.", { exit: 1 });
      if (t === "tools") {
        wiringToolsRemove(config, name);
        this.log(`Removed tool server "${name}" (${path})`);
      } else if (t === "loggers") {
        wiringLoggersRemove(config, name);
        this.log(`Removed loggers.config.${name} (${path})`);
      } else {
        wiringEndpointsRemove(config, name);
        this.log(`Removed agents.endpoints.${name} (${path})`);
      }
    }

    persistConfig(path, config);
  }
}
