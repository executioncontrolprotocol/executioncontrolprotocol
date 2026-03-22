import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../lib/system-config-cli.js";

/**
 * Shorthand for `ecp config plugins allow add` — adds a provider ID to security.models.allowProviders.
 */
export default class ConfigPluginsAdd extends Command {
  static summary = "Add a model provider ID to security.models.allowProviders";

  static args = {
    id: Args.string({ required: true, description: "Plugin ID (e.g. openai, ollama, file)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsAdd);
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
