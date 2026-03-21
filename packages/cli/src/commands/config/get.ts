import { Command, Flags } from "@oclif/core";

import { stringifySystemConfig } from "@executioncontrolprotocol/runtime";

import {
  CONFIG_DUMP_HEADER_WHEN_MISSING,
  formatConfigFileHeaderLine,
  runWithCommandError,
} from "../../lib/command-helpers.js";
import { configScopeFlags } from "../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../lib/system-config-cli.js";

export default class ConfigGet extends Command {
  static summary = "Get the resolved system config (YAML or JSON)";

  static flags = {
    ...configScopeFlags,
    format: Flags.string({
      description: "Serialization format",
      options: ["yaml", "json"] as const,
      default: "yaml",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      const fmt = flags.format as "yaml" | "json";
      this.log(formatConfigFileHeaderLine(path, exists, CONFIG_DUMP_HEADER_WHEN_MISSING));
      this.log(stringifySystemConfig(config, fmt));
    });
  }
}
