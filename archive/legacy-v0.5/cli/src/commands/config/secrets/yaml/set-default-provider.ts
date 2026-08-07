import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

export default class ConfigSecretsYamlSetDefaultProvider extends Command {
  static summary = "Set secrets.defaultProvider";

  static args = {
    provider: Args.string({ required: true, description: "Provider id (e.g. os.secrets, dot.env)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecretsYamlSetDefaultProvider);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.secrets ??= {};
    config.secrets.defaultProvider = args.provider;

    persistConfig(path, config);
    this.log(`Set secrets.defaultProvider = ${args.provider} (${path})`);
  }
}
