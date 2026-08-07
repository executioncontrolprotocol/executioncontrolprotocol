import { Command } from "@oclif/core";

export default class ConfigPlugins extends Command {
  static summary = "Plugin installs (plugins.installs); policy is ecp config security";

  static description = `Install metadata and listing. Allow/deny for providers and extension policy live under \`ecp config security\`.

Subcommands:
  get              List plugins.installs keys + security.plugins summary
  installs list|add|remove`;

  async run(): Promise<void> {
    await this.parse(ConfigPlugins);
    this.log(
      [
        "Usage: ecp config plugins <subcommand>",
        "",
        "  get              plugins.installs + security.plugins",
        "  installs list",
        "  installs add <id> --npm <spec> [--path <dir>] [--kind tool]",
        "  installs remove <id>",
        "",
        "Policy examples:",
        "  ecp config security models allow add ollama",
        "  ecp config security plugins update --file policy.json",
        "",
        "Run ecp config plugins <cmd> --help for flags.",
      ].join("\n"),
    );
  }
}
