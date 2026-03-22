import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";

export default class ConfigToolsGet extends Command {
  static summary = "Get MCP tool server names (tools.servers)";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigToolsGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const names = config.tools?.servers ? Object.keys(config.tools.servers) : [];
      if (names.length === 0) {
        this.log("(no tool servers configured)");
        return;
      }
      for (const n of names.sort()) {
        this.log(`- ${n}`);
      }
    });
  }
}
