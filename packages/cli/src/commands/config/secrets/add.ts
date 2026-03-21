import { Command, Flags } from "@oclif/core";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { OS_PROVIDER_ID } from "../../../lib/secret-provider-ids.js";
import { resolveDotenvPathFromConfig, resolveSecretPolicyFromConfig } from "../../../lib/secrets-config.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import {
  canonicalSecretKeyForBinding,
  createDefaultSecretBroker,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  secretRefIdFromLogicalKey,
} from "@executioncontrolprotocol/runtime";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

export default class ConfigSecretsAdd extends Command {
  static summary = `Add or replace a secret in a provider (e.g. ${OS_PROVIDER_ID})`;

  static flags = {
    ...configScopeFlags,
    provider: Flags.string({
      char: "p",
      description: `Provider id (e.g. ${OS_PROVIDER_ID})`,
      required: true,
    }),
    key: Flags.string({
      char: "k",
      description:
        `Secret lookup key (e.g. GITHUB_API_KEY or server/fetch.token; ref id is ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>)`,
      required: true,
    }),
    value: Flags.string({
      char: "v",
      description: "Secret value (avoid in shell history; prefer --prompt)",
    }),
    prompt: Flags.boolean({
      description: "Read secret from stdin interactively (masked input not supported on all terminals)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecretsAdd);
    if (flags.value && flags.prompt) {
      this.error("Use only one of --value or --prompt.", { exit: 1 });
    }
    if (!flags.value && !flags.prompt) {
      this.error("Provide --value or --prompt.", { exit: 1 });
    }

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
    if (!provider.store) {
      this.error(`Provider "${flags.provider}" does not support store (read-only).`, { exit: 1 });
    }
    const available = await provider.isAvailable();
    if (!available) {
      this.error(`Provider "${flags.provider}" is not available on this system.`, { exit: 1 });
    }

    let value = flags.value ?? "";
    if (flags.prompt) {
      const rl = createInterface({ input, output });
      try {
        value = (await rl.question("Secret value: ")).trim();
      } finally {
        await rl.close();
      }
    }
    if (!value) {
      this.error("Empty secret.", { exit: 1 });
    }

    const ref: SecretRef = {
      id: secretRefIdFromLogicalKey(flags.key!),
      provider: flags.provider!,
      key: canonicalSecretKeyForBinding(flags.key!),
    };
    await provider.store({ ref, value });
    this.log(`Stored secret for provider "${flags.provider}" key "${flags.key}".`);
  }
}
