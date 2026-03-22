import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { getSecurityConfig } from "@executioncontrolprotocol/runtime";

export default class ConfigLoggersGet extends Command {
  static summary = "Get logger allow-lists, defaults, and config keys";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigLoggersGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const secLog = getSecurityConfig(config)?.loggers;
      this.log("security.loggers.allowEnable:");
      this.log(
        secLog?.allowEnable?.length
          ? secLog.allowEnable.map((x: string) => `  - ${x}`).join("\n")
          : "  (not set)",
      );
      this.log("security.loggers.defaultEnable:");
      this.log(
        secLog?.defaultEnable?.length
          ? secLog.defaultEnable.map((x: string) => `  - ${x}`).join("\n")
          : "  (not set)",
      );
      this.log("loggers.config keys:");
      this.log(
        config.loggers?.config
          ? Object.keys(config.loggers.config).map((k) => `  - ${k}`).join("\n")
          : "  (not set)",
      );
    });
  }
}
