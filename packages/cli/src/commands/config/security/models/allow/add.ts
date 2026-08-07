import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityModelsAllowAdd extends Command {
  static summary = "Add a provider id to security.models.allowProviders";

  static args = {
    id: Args.string({ required: true, description: "Model provider id (e.g. openai, ollama)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityModelsAllowAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.models ??= {};
    sec.models.allowProviders = addUnique(sec.models.allowProviders, args.id);

    persistConfig(path, config);
    this.log(`Updated security.models.allowProviders (${path}): ${sec.models.allowProviders?.join(", ")}`);
  }
}
