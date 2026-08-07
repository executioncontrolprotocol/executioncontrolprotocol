import { Command } from "@oclif/core";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { resolveDotenvPathFromConfig, resolveSecretPolicyFromConfig } from "../../../../lib/secrets-config.js";
import { loadConfigForDisplay } from "../../../../lib/system-config-cli.js";
import { createDefaultSecretBroker } from "@executioncontrolprotocol/runtime";

export default class ConfigSecretsProvidersDoctor extends Command {
  static summary = "Run health checks for each secret provider";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecretsProvidersDoctor);
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

    let failed = false;
    for (const { provider } of registry.list()) {
      const h = await provider.healthCheck();
      const line = `${provider.id}: ${h.ok ? "ok" : "FAIL"}${h.message ? ` — ${h.message}` : ""}`;
      if (h.ok) {
        this.log(line);
      } else {
        this.warn(line);
        failed = true;
      }
    }
    if (failed) {
      this.exit(1);
    }
  }
}
