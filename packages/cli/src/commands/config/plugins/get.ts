import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";
import { getSystemPluginPolicy } from "@executioncontrolprotocol/runtime";

export default class ConfigPluginsGet extends Command {
  static summary = "Get plugin allow-lists, defaults, and security";

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
      const ex = getSystemPluginPolicy(config);
      this.log("allowEnable:");
      this.log(ex?.allowEnable?.length ? ex.allowEnable.map((x: string) => `  - ${x}`).join("\n") : "  (not set)");
      this.log("defaultEnable:");
      this.log(ex?.defaultEnable?.length ? ex.defaultEnable.map((x: string) => `  - ${x}`).join("\n") : "  (not set)");
      this.log("security:");
      if (ex?.security) {
        this.log(JSON.stringify(ex.security, null, 2));
      } else {
        this.log("  (not set)");
      }
    });
  }
}
