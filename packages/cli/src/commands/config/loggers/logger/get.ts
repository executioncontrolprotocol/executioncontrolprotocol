import { Args, Command } from "@oclif/core";

import { formatConfigFileHeaderLine, runWithCommandError } from "../../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { loadConfigForDisplay } from "../../../../lib/system-config-cli.js";

export default class ConfigLoggersLoggerGet extends Command {
  static summary = "Get loggers.config.<loggerId> as JSON";

  static args = {
    id: Args.string({ required: true, description: "Logger ID" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigLoggersLoggerGet);
    const cwd = process.cwd();

    await runWithCommandError(this, async () => {
      const { path, exists, config } = loadConfigForDisplay({
        global: flags.global as boolean,
        cwd,
        explicit: flags.config as string | undefined,
      });

      this.log(formatConfigFileHeaderLine(path, exists));
      const blob = config.loggers?.config?.[args.id];
      if (blob === undefined) {
        this.log(`(no config for logger "${args.id}")`);
        return;
      }
      this.log(JSON.stringify(blob, null, 2));
    });
  }
}
