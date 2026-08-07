import { Args, Command } from "@oclif/core";
import type { SecretPolicyMode } from "@executioncontrolprotocol/plugins";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

const MODES: SecretPolicyMode[] = ["permissive", "warn", "strict"];

export default class ConfigSecretsYamlSetPolicy extends Command {
  static summary = "Set secrets.policy (permissive | warn | strict)";

  static args = {
    mode: Args.string({
      required: true,
      description: "Policy mode",
      options: MODES,
    }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecretsYamlSetPolicy);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.secrets ??= {};
    config.secrets.policy = args.mode as SecretPolicyMode;

    persistConfig(path, config);
    this.log(`Set secrets.policy = ${args.mode} (${path})`);
  }
}
