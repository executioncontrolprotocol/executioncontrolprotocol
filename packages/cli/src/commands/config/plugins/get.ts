import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { getSecurityConfig } from "@executioncontrolprotocol/runtime";

export default class ConfigPluginsGet extends Command {
  static summary = "List plugin installs (plugins.installs) — policy is under security.plugins";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigPluginsGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const installs = config.plugins?.installs;
      this.log("plugins.installs keys:");
      this.log(
        installs && Object.keys(installs).length > 0
          ? Object.keys(installs).map((k) => `  - ${k}`).join("\n")
          : "  (not set)",
      );
      const secPlugins = getSecurityConfig(config)?.plugins;
      this.log("security.plugins (extension policy):");
      this.log(secPlugins ? JSON.stringify(secPlugins, null, 2) : "  (not set)");
    });
  }
}
