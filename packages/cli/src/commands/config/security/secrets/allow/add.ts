import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecuritySecretsAllowAdd extends Command {
  static summary = "Add a secret provider id to security.secrets.allowProviders";

  static args = {
    id: Args.string({ required: true, description: "secrets.providers key (e.g. os.secrets)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecuritySecretsAllowAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.secrets ??= {};
    sec.secrets.allowProviders = addUnique(sec.secrets.allowProviders, args.id);

    persistConfig(path, config);
    this.log(`Updated security.secrets.allowProviders (${path}): ${sec.secrets.allowProviders?.join(", ")}`);
  }
}
