import { Args, Command, Flags } from "@oclif/core";
import { readFileSync } from "node:fs";

import { commandErrorMessage } from "../../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

export default class ConfigLoggersLoggerAdd extends Command {
  static summary = "Add loggers.config.<loggerId> (fails if id already exists)";

  static args = {
    id: Args.string({ required: true, description: "Logger ID" }),
  };

  static flags = {
    ...configScopeFlags,
    json: Flags.string({
      description: "JSON object for this logger's config",
    }),
    file: Flags.string({
      description: "Path to a JSON file with the logger config object",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigLoggersLoggerAdd);
    if (!flags.json && !flags.file) {
      this.error("Provide --json or --file.", { exit: 1 });
    }
    if (flags.json && flags.file) {
      this.error("Use only one of --json or --file.", { exit: 1 });
    }

    const raw = flags.file ? readFileSync(flags.file, "utf-8") : String(flags.json);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.error(`Invalid JSON: ${commandErrorMessage(e)}`, { exit: 1 });
    }

    if (!parsed || typeof parsed !== "object") {
      this.error("Logger config must be a JSON object.", { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.loggers ??= {};
    config.loggers.config ??= {};
    if (config.loggers.config[args.id] !== undefined) {
      this.error(
        `Logger config "${args.id}" already exists. Use "ecp config loggers logger update".`,
        { exit: 1 },
      );
    }

    config.loggers.config[args.id] = parsed as Record<string, unknown>;

    persistConfig(path, config);
    this.log(`Added loggers.config.${args.id} (${path})`);
  }
}
