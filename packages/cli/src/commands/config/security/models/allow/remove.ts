import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityModelsAllowRemove extends Command {
  static summary = "Remove a provider id from security.models.allowProviders";

  static args = {
    id: Args.string({ required: true, description: "Model provider id" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityModelsAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.models ??= {};
    sec.models.allowProviders = removeId(sec.models.allowProviders, args.id);

    persistConfig(path, config);
    this.log(
      `Updated security.models.allowProviders (${path}): ${sec.models.allowProviders?.join(", ") ?? "(empty)"}`,
    );
  }
}
