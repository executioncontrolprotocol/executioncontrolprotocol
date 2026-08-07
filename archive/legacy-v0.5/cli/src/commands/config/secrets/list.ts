import { Command, Flags } from "@oclif/core";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { OS_PROVIDER_ID } from "../../../lib/secret-provider-ids.js";
import { resolveDotenvPathFromConfig, resolveSecretPolicyFromConfig } from "../../../lib/secrets-config.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { createDefaultSecretBroker } from "@executioncontrolprotocol/runtime";

export default class ConfigSecretsList extends Command {
  static summary = "List secret keys for a provider (when supported)";

  static flags = {
    ...configScopeFlags,
    provider: Flags.string({
      char: "p",
      description: `Provider id (e.g. ${OS_PROVIDER_ID})`,
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecretsList);
    const cwd = process.cwd();
    const { config } = loadConfigForDisplay({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });
    const dotenvPath = resolveDotenvPathFromConfig(cwd, config);
    const { registry } = createDefaultSecretBroker({
      policy: resolveSecretPolicyFromConfig(config),
      dotenvPath,
      cwd,
    });

    const provider = registry.get(flags.provider!);
    if (!provider) {
      this.error(`Unknown provider "${flags.provider}".`, { exit: 1 });
    }
    if (!provider.list) {
      this.error(`Provider "${flags.provider}" does not support list.`, { exit: 1 });
    }
    const available = await provider.isAvailable();
    if (!available) {
      this.error(`Provider "${flags.provider}" is not available.`, { exit: 1 });
    }

    const refs = await provider.list();
    if (refs.length === 0) {
      this.log("(no entries)");
      return;
    }
    for (const r of refs) {
      this.log(`  ${r.key}`);
    }
  }
}
