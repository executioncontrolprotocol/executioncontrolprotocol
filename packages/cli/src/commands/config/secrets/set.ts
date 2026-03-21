import { Command, Flags } from "@oclif/core";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";

import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { createDefaultSecretBroker } from "@executioncontrolprotocol/runtime";
import type { SecretRef } from "@executioncontrolprotocol/plugins";

export default class ConfigSecretsSet extends Command {
  static summary = "Store a secret in a provider (os-keychain, cli-session)";

  static flags = {
    ...configScopeFlags,
    provider: Flags.string({
      char: "p",
      description: "Provider id (e.g. os-keychain, cli-session)",
      required: true,
    }),
    key: Flags.string({
      char: "k",
      description: "Provider account / lookup key (e.g. ecp/server/fetch.token)",
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
    const { flags } = await this.parse(ConfigSecretsSet);
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
    const dotenvRel = config.secrets?.providers?.dotenv?.path;
    const dotenvPath = dotenvRel ? resolve(cwd, dotenvRel) : resolve(cwd, ".env");
    const { registry } = createDefaultSecretBroker({
      policy: config.secrets?.policy ?? "warn",
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
      id: `ecp://${flags.provider}/${flags.key}`,
      provider: flags.provider!,
      key: flags.key!,
    };
    await provider.store({ ref, value });
    this.log(`Stored secret for provider "${flags.provider}" key "${flags.key}".`);
  }
}
