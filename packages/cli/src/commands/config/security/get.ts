import { Command, Flags } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { getSecurityConfig, stringifySystemConfig, type ECPSystemConfig } from "@executioncontrolprotocol/runtime";

export default class ConfigSecurityGet extends Command {
  static summary = "Print the security policy block (YAML or JSON)";

  static flags = {
    ...configScopeFlags,
    format: Flags.string({
      description: "Serialization format",
      options: ["yaml", "json"] as const,
      default: "yaml",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecurityGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const sec = getSecurityConfig(config) ?? {};
      const fmt = flags.format as "yaml" | "json";
      const slice: ECPSystemConfig = { security: sec };
      this.log(stringifySystemConfig(slice, fmt).trim());
    });
  }
}
