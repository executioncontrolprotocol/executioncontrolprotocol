import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../lib/system-config-cli.js";

export default class ConfigPluginsDefaultRemove extends Command {
  static summary = "Remove a model provider ID from security.models.defaultProviders";

  static args = {
    id: Args.string({ required: true, description: "Plugin ID" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsDefaultRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.models ??= {};
    sec.models.defaultProviders = removeId(sec.models.defaultProviders, args.id);

    persistConfig(path, config);
    this.log(
      `Updated security.models.defaultProviders (${path}): ${sec.models.defaultProviders?.join(", ") ?? "(empty)"}`,
    );
  }
}
