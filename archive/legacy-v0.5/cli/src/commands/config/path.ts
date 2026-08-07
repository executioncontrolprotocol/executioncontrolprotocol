import { Command, Flags } from "@oclif/core";

import { runWithCommandError } from "../../lib/command-helpers.js";
import { configScopeFlags } from "../../lib/config-flags.js";
import { loadConfigForDisplay, resolveWritePathForMutation } from "../../lib/system-config-cli.js";

export default class ConfigPath extends Command {
  static summary = "Print the config file path used for read/write";

  static description =
    "Shows the path: for reads, the first existing file in scope (or canonical path if none). " +
    "With --for-write, shows the file that mutating subcommands would update.";

  static flags = {
    ...configScopeFlags,
    "for-write": Flags.boolean({
      description: "Show the path that mutating subcommands would write (prefer existing local/global file)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigPath);
    const cwd = process.cwd();
    const global = flags.global as boolean;
    const explicit = flags.config as string | undefined;

    if (flags["for-write"]) {
      const path = resolveWritePathForMutation({ global, cwd, explicit });
      this.log(path);
      return;
    }

    await runWithCommandError(this, async () => {
      const { path, exists } = loadConfigForDisplay({ global, cwd, explicit });
      this.log(path + (exists ? "" : " (not created yet — run ecp config init)"));
    });
  }
}
