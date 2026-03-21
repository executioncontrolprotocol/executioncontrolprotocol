import { Command } from "@oclif/core";

export default class ConfigSecrets extends Command {
  static summary = "Manage secrets (OS keyring, env, dotenv, CLI session)";

  static description = `Store and inspect secret values outside config files. Prefer os-keychain on Mac/Windows.

Subcommands:
  set|get|delete|list     CRUD for a provider key
  providers list|doctor   Availability and health`;

  static examples = [
    "ecp config secrets set --provider os-keychain --key ecp/server/fetch.token --prompt",
    "ecp config secrets get --provider os-keychain --key ecp/server/fetch.token",
    "ecp config secrets providers doctor",
  ];

  async run(): Promise<void> {
    await this.parse(ConfigSecrets);
    this.log(
      [
        "Usage: ecp config secrets <subcommand>",
        "",
        "  set       Store a secret (os-keychain, cli-session)",
        "  get       Read a secret (default: redacted preview)",
        "  delete    Remove a stored secret",
        "  list      List keys (when supported by provider)",
        "  providers list|doctor",
        "",
        "Run ecp config secrets <cmd> --help for flags.",
      ].join("\n"),
    );
  }
}
