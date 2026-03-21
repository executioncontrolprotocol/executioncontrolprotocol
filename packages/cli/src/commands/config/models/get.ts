import { Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../lib/system-config-cli.js";

export default class ConfigModelsGet extends Command {
  static summary = "Get model provider defaults and allowed models";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigModelsGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const mp = config.modelProviders;
      for (const key of ["openai", "ollama"] as const) {
        const block = mp?.[key];
        this.log(`${key}:`);
        if (!block) {
          this.log("  (not set)\n");
          continue;
        }
        if (block.defaultModel) this.log(`  defaultModel: ${block.defaultModel}`);
        if (block.allowedModels?.length) this.log(`  allowedModels: ${block.allowedModels.join(", ")}`);
        if (key === "ollama" && "baseURL" in block && block.baseURL) {
          this.log(`  baseURL: ${block.baseURL}`);
        }
        this.log("");
      }
    });
  }
}
