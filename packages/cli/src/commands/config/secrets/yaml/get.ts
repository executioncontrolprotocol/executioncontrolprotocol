import { Command, Flags } from "@oclif/core";

import {
  getSecurityConfig,
  stringifySystemConfig,
  type ECPSystemConfig,
} from "@executioncontrolprotocol/runtime";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../../lib/system-config-cli.js";

export default class ConfigSecretsYamlGet extends Command {
  static summary = "Print top-level secrets.* and security.secrets (YAML/JSON)";

  static flags = {
    ...configScopeFlags,
    format: Flags.string({
      description: "Serialization format",
      options: ["yaml", "json"] as const,
      default: "yaml",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecretsYamlGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const slice: ECPSystemConfig = {
        secrets: config.secrets,
        security: { secrets: getSecurityConfig(config)?.secrets },
      };
      const fmt = flags.format as "yaml" | "json";
      this.log(stringifySystemConfig(slice, fmt).trim());
    });
  }
}
