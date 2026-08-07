import { Command, Flags } from "@oclif/core";
import { stringifySystemConfig } from "@executioncontrolprotocol/runtime";

import {
  CONFIG_DUMP_HEADER_WHEN_MISSING,
  formatConfigFileHeaderLine,
  runWithCommandError,
} from "../../lib/command-helpers.js";
import { configScopeFlags } from "../../lib/config-flags.js";
import {
  formatModelsWiringSummary,
  isWiringType,
  wiringEndpointsFormatLines,
  wiringLoggersListSortedIds,
  wiringToolsListSortedNames,
} from "../../lib/config-wiring-ops.js";
import { loadConfigForDisplay } from "../../lib/system-config-cli.js";

export default class ConfigGet extends Command {
  static summary = "Get full system config or a wiring slice (--type)";

  static flags = {
    ...configScopeFlags,
    format: Flags.string({
      description: "Serialization format (full dump only; ignored with --type)",
      options: ["yaml", "json"] as const,
      default: "yaml",
    }),
    type: Flags.string({
      description: "Wiring slice: tools | models | loggers | endpoints (omit for full config)",
      options: ["tools", "models", "loggers", "endpoints"],
    }),
    id: Flags.string({
      description: "With --type loggers: print one loggers.config.<id> as JSON",
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

      const sliceType = flags.type as string | undefined;
      if (!sliceType) {
        const fmt = flags.format as "yaml" | "json";
        this.log(formatConfigFileHeaderLine(path, exists, CONFIG_DUMP_HEADER_WHEN_MISSING));
        this.log(stringifySystemConfig(config, fmt));
        return;
      }

      if (!isWiringType(sliceType)) {
        throw new Error(`Invalid --type: ${sliceType}`);
      }

      this.log(formatConfigFileHeaderLine(path, exists));

      if (sliceType === "tools") {
        const names = wiringToolsListSortedNames(config);
        if (names.length === 0) {
          this.log("(no tool servers configured)");
          return;
        }
        for (const n of names) this.log(`- ${n}`);
        return;
      }

      if (sliceType === "models") {
        this.log(formatModelsWiringSummary(config).trimEnd());
        return;
      }

      if (sliceType === "loggers") {
        const id = flags.id as string | undefined;
        if (id) {
          const blob = config.loggers?.config?.[id];
          if (blob === undefined) {
            this.log(`(no config for logger "${id}")`);
            return;
          }
          this.log(JSON.stringify(blob, null, 2));
          return;
        }
        const ids = wiringLoggersListSortedIds(config);
        if (ids.length === 0) {
          this.log("(no loggers.config entries)");
          return;
        }
        for (const i of ids) this.log(`- ${i}`);
        return;
      }

      if (sliceType === "endpoints") {
        const lines = wiringEndpointsFormatLines(config);
        if (lines.length === 0) {
          this.log("(no agent endpoints configured)");
          return;
        }
        for (const line of lines) this.log(line);
      }
    });
  }
}
