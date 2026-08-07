import { Command } from "@oclif/core";
import { OS_PROVIDER_ID } from "../../lib/secret-provider-ids.js";

export default class ConfigSecrets extends Command {
  static summary = "Manage secrets (process.env, dot.env, os.secrets, …)";

  static description = `Store and inspect secret values outside config files. Prefer os.secrets on Mac/Windows.

Subcommands:
  add|get|remove|list     CRUD-style commands for a provider key
  providers list|doctor   Availability and health
  yaml get                Print secrets.* + security.secrets from the YAML file
  yaml set-default-provider|set-policy   Edit non-secret YAML fields`;

  static examples = [
    `ecp config secrets add --provider ${OS_PROVIDER_ID} --key server/fetch.token --prompt`,
    `ecp config secrets get --provider ${OS_PROVIDER_ID} --key ecp.server.fetch.token`,
    "ecp config secrets providers doctor",
  ];

  async run(): Promise<void> {
    await this.parse(ConfigSecrets);
    this.log(
      [
        "Usage: ecp config secrets <subcommand>",
        "",
        `  add       Add or replace a secret (${OS_PROVIDER_ID}, …)`,
        "  get       Read a secret (default: redacted preview)",
        "  remove    Remove a stored secret",
        "  list      List keys (when supported by provider)",
        "  providers list|doctor",
        "  yaml get  Print secrets + security.secrets blocks",
        "  yaml set-default-provider <id>",
        "  yaml set-policy <permissive|warn|strict>",
        "",
        "Run ecp config secrets <cmd> --help for flags.",
      ].join("\n"),
    );
  }
}
