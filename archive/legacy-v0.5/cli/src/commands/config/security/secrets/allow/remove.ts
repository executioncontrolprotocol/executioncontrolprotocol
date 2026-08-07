import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecuritySecretsAllowRemove extends Command {
  static summary = "Remove a secret provider id from security.secrets.allowProviders";

  static args = {
    id: Args.string({ required: true, description: "secrets.providers key" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecuritySecretsAllowRemove);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.secrets ??= {};
    sec.secrets.allowProviders = removeId(sec.secrets.allowProviders, args.id);

    persistConfig(path, config);
    this.log(
      `Updated security.secrets.allowProviders (${path}): ${sec.secrets.allowProviders?.join(", ") ?? "(empty)"}`,
    );
  }
}
