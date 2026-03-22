import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../../lib/system-config-cli.js";

export default class ConfigPluginsInstallsList extends Command {
  static summary = "List keys under plugins.installs";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigPluginsInstallsList);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const installs = config.plugins?.installs;
      if (!installs || Object.keys(installs).length === 0) {
        this.log("(no plugins.installs entries)");
        return;
      }
      for (const k of Object.keys(installs).sort()) {
        this.log(`  - ${k}`);
      }
    });
  }
}
