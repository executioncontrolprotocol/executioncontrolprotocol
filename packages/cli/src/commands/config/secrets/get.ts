import { Command, Flags } from "@oclif/core";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { OS_PROVIDER_ID } from "../../../lib/secret-provider-ids.js";
import { resolveDotenvPathFromConfig, resolveSecretPolicyFromConfig } from "../../../lib/secrets-config.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import {
  canonicalSecretKeyForBinding,
  createDefaultSecretBroker,
  secretRefIdFromLogicalKey,
} from "@executioncontrolprotocol/runtime";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

export default class ConfigSecretsGet extends Command {
  static summary = "Read a secret (redacted by default)";

  static flags = {
    ...configScopeFlags,
    provider: Flags.string({
      char: "p",
      description: "Provider id",
      required: true,
    }),
    key: Flags.string({
      char: "k",
      description: `Lookup key (${OS_PROVIDER_ID}: same form as add; normalized to ecp.* in the keyring)`,
      required: true,
    }),
    show: Flags.boolean({
      description: "Print full value (writes to stdout — avoid logs)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecretsGet);
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
    const available = await provider.isAvailable();
    if (!available) {
      this.error(`Provider "${flags.provider}" is not available.`, { exit: 1 });
    }

    const ref: SecretRef = {
      id: secretRefIdFromLogicalKey(flags.key!),
      provider: flags.provider!,
      key: canonicalSecretKeyForBinding(flags.key!),
    };
    const result = await provider.load(ref);
    if (!result) {
      this.error(`No secret for key "${flags.key}".`, { exit: 1 });
    }
    if (flags.show) {
      this.warn("Printing full secret to stdout — ensure this is not logged or captured.");
      this.log(result.value);
    } else {
      this.log(result.redactedPreview);
    }
  }
}
