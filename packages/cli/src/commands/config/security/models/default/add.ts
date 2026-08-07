import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityModelsDefaultAdd extends Command {
  static summary = "Add a provider id to security.models.defaultProviders";

  static args = {
    id: Args.string({ required: true, description: "Model provider id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityModelsDefaultAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.models ??= {};
    sec.models.defaultProviders = addUnique(sec.models.defaultProviders, args.id);
    if (sec.models.allowProviders && sec.models.allowProviders.length > 0) {
      sec.models.allowProviders = addUnique(sec.models.allowProviders, args.id);
    }

    persistConfig(path, config);
    this.log(`Updated security.models.defaultProviders (${path}): ${sec.models.defaultProviders?.join(", ")}`);
  }
}
