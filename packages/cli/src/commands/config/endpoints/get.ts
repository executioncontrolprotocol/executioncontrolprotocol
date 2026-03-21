import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";

export default class ConfigEndpointsGet extends Command {
  static summary = "Get A2A agent endpoints (agentEndpoints)";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigEndpointsGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const ae = config.agentEndpoints;
      if (!ae || Object.keys(ae).length === 0) {
        this.log("(no agent endpoints configured)");
        return;
      }
      for (const k of Object.keys(ae).sort()) {
        this.log(`${k}: ${ae[k]}`);
      }
    });
  }
}
